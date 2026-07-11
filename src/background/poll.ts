import type { AuthState, DebugDump, InboxSection, InboxSnapshot } from '../types';
import { buildInboxQueriesUrl, fetchInboxQueries } from '../lib/github/fetch';
import { ParseError, parseInboxResponse } from '../lib/github/parseInbox';
import { pollTargets } from '../lib/settings';
import {
  loadBackoffUntil,
  loadSettings,
  loadSnapshot,
  saveBackoffUntil,
  saveDebugDump,
  saveSnapshot,
} from '../storage';
import { updateBadge } from './badge';
import { syncTabs } from './tabSync';

const MAX_PAGES_PER_SECTION = 4;
const REQUEST_SPACING_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * poll の直列化ラッパー。alarm と手動 REFRESH（popup 開時にも飛ぶ）が
 * 並走すると GitHub への同時リクエストが倍増し 429 リスク・後勝ち競合を招くため、
 * 'poll' ロックを ifAvailable で取得し、実行中なら 2 本目はスキップする。
 * tab-sync ロックとは別名・一方向取得なのでデッドロックしない。
 * @returns 実際に poll を走らせたら true、既存 poll によりスキップなら false
 */
export async function runPoll(): Promise<boolean> {
  let ran = false;
  await navigator.locks.request('poll', { ifAvailable: true }, async (lock) => {
    if (!lock) return; // 実行中の poll がいる → スキップ
    ran = true;
    await runPollLocked();
  });
  return ran;
}

/**
 * fetch → parse → cache → badge → tab sync のパイプライン。
 * popupは全セクションを表示するため、タブ同期の有効/無効に関わらず既知の全セクション + カスタムセクション を取得する。
 *
 * エラー隔離: HTTP/parse 失敗はそのセクションだけ失敗扱いにして続行し、
 * 成功セクションの新データは捨てない（失敗セクションは前回 snapshot で補完）。
 * logged_out / rate_limited はセッション全体の状態なので従来どおり全体中断する。
 */
async function runPollLocked(): Promise<void> {
  const settings = await loadSettings();
  const backoffUntil = await loadBackoffUntil();
  if (backoffUntil && Date.now() < backoffUntil) return;

  const prev = await loadSnapshot();
  const prevById = new Map((prev?.sections ?? []).map((s) => [s.id, s]));

  const sections: InboxSection[] = [];
  const sectionErrors: { id: string; detail: string }[] = [];
  const dumps: DebugDump[] = [];
  let sawSuccess = false;
  let globalAuth: 'logged_out' | 'rate_limited' | undefined;
  let requested = 0;

  outer: for (const target of pollTargets(settings)) {
    const { id, label, filter } = target;
    const section: InboxSection = { id, label, prs: [] };
    let sectionFailed = false;

    for (let page = 1; page <= MAX_PAGES_PER_SECTION; page++) {
      if (requested > 0) await sleep(REQUEST_SPACING_MS);
      requested++;
      const outcome = await fetchInboxQueries(filter, settings.maxPrAge, page);

      if (outcome.kind === 'logged_out') {
        globalAuth = 'logged_out';
        break outer;
      }
      if (outcome.kind === 'rate_limited') {
        globalAuth = 'rate_limited';
        await saveBackoffUntil(Date.now() + outcome.retryAfterSeconds * 1000);
        break outer;
      }
      if (outcome.kind === 'http_error') {
        // このセクションだけ失敗扱いにして次のセクションへ
        sectionErrors.push({ id, detail: `HTTP ${outcome.status} (${id}): ${outcome.detail}` });
        sectionFailed = true;
        break;
      }

      try {
        const parsed = parseInboxResponse(outcome.body);
        section.prs.push(...parsed.prs);
        if (parsed.currentPage >= parsed.totalPages) break;
        if (page === MAX_PAGES_PER_SECTION) section.truncated = true;
      } catch (e) {
        const detail = e instanceof ParseError ? `parse failed (${id}): ${e.message}` : String(e);
        sectionErrors.push({ id, detail });
        sectionFailed = true;
        if (settings.debugMode) {
          dumps.push({
            url: buildInboxQueriesUrl(filter, settings.maxPrAge, page),
            status: outcome.status,
            body: outcome.body,
            at: Date.now(),
          });
        }
        break;
      }
    }

    if (sectionFailed) {
      // 失敗セクションは前回 snapshot の同id セクションで補完（なければ空）
      const fallback = prevById.get(id);
      sections.push(fallback ? { ...fallback } : { id, label, prs: [] });
    } else {
      sawSuccess = true;
      sections.push(section);
    }
  }

  if (dumps.length > 0) await saveDebugDump(dumps);

  // logged_out / rate_limited はセッション全体の状態: 従来どおりキャッシュ保持＋状態更新
  if (globalAuth) {
    const snapshot: InboxSnapshot = {
      fetchedAt: prev?.fetchedAt ?? 0,
      sections: prev?.sections ?? [],
      authState: globalAuth,
    };
    await saveSnapshot(snapshot);
    await updateBadge(snapshot, settings);
    return;
  }

  // 成功が1つでもあれば 'ok'（新データを反映）。全滅時のみ 'error'。
  const authState: AuthState = sawSuccess || sectionErrors.length === 0 ? 'ok' : 'error';
  const snapshot: InboxSnapshot = {
    // 新データが1つでもあれば「今」取得したものとして扱う。全滅時は前回の鮮度を維持。
    fetchedAt: sawSuccess ? Date.now() : (prev?.fetchedAt ?? 0),
    sections,
    authState,
    ...(sectionErrors.length > 0 ? { sectionErrors } : {}),
    ...(authState === 'error' && sectionErrors[0] ? { errorDetail: sectionErrors[0].detail } : {}),
  };
  await saveSnapshot(snapshot);
  await updateBadge(snapshot, settings);
  // authState !== 'ok' のときは syncTabs 側が早期 return する（マージ後 snapshot に対して実行）
  await syncTabs(settings.forceAlignOnRefresh);
}

/** 設定変更時: 再フェッチせずキャッシュからバッジ・タブ同期だけ再計算 */
export async function applySettingsChange(): Promise<void> {
  const settings = await loadSettings();
  const snapshot = await loadSnapshot();
  await updateBadge(snapshot, settings);
  await syncTabs();
}

/** デバッグ: 全既知セクション + カスタムセクション の生レスポンスを storage.local に保存 */
export async function runDebugDump(): Promise<{ saved: number }> {
  const settings = await loadSettings();
  const dumps: DebugDump[] = [];
  for (const { filter } of pollTargets(settings)) {
    const url = buildInboxQueriesUrl(filter, settings.maxPrAge);
    const outcome = await fetchInboxQueries(filter, settings.maxPrAge);
    dumps.push({
      url,
      status: outcome.kind === 'ok' ? outcome.status : -1,
      body: outcome.kind === 'ok' ? outcome.body : outcome,
      at: Date.now(),
    });
    await sleep(REQUEST_SPACING_MS);
  }
  await saveDebugDump(dumps);
  return { saved: dumps.length };
}
