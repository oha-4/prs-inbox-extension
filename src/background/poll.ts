import type { AuthState, DebugDump, InboxSection, InboxSnapshot } from '../types';
import { buildInboxQueriesUrl, fetchInboxQueries } from '../lib/github/fetch';
import { ParseError, parseInboxResponse } from '../lib/github/parseInbox';
import { KNOWN_SECTIONS } from '../lib/settings';
import {
  loadSettings,
  loadSnapshot,
  loadSyncState,
  saveDebugDump,
  saveSnapshot,
  saveSyncState,
} from '../storage';
import { updateBadge } from './badge';
import { syncTabs } from './tabSync';

const MAX_PAGES_PER_SECTION = 4;
const REQUEST_SPACING_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch → parse → cache → badge → tab sync のパイプライン。
 * popupは全セクションを表示するため、タブ同期の有効/無効に関わらず既知の全セクションを取得する。
 */
export async function runPoll(): Promise<void> {
  const settings = await loadSettings();
  const syncState = await loadSyncState();
  if (syncState.backoffUntil && Date.now() < syncState.backoffUntil) return;

  const sections: InboxSection[] = [];
  let authState: AuthState = 'ok';
  let errorDetail: string | undefined;
  const dumps: DebugDump[] = [];

  outer: for (const { id, label } of KNOWN_SECTIONS) {
    const cfg = settings.sections[id];
    const section: InboxSection = { id, label: cfg?.label ?? label, prs: [] };

    for (let page = 1; page <= MAX_PAGES_PER_SECTION; page++) {
      if (sections.length > 0 || page > 1) await sleep(REQUEST_SPACING_MS);
      const outcome = await fetchInboxQueries(id, settings.maxPrAge, page);

      if (outcome.kind === 'logged_out') {
        authState = 'logged_out';
        break outer;
      }
      if (outcome.kind === 'rate_limited') {
        authState = 'rate_limited';
        await saveSyncState({
          ...syncState,
          backoffUntil: Date.now() + outcome.retryAfterSeconds * 1000,
        });
        break outer;
      }
      if (outcome.kind === 'http_error') {
        authState = 'error';
        errorDetail = `HTTP ${outcome.status} (${id}): ${outcome.detail}`;
        break outer;
      }

      try {
        const parsed = parseInboxResponse(outcome.body);
        section.prs.push(...parsed.prs);
        if (parsed.currentPage >= parsed.totalPages) break;
        if (page === MAX_PAGES_PER_SECTION) section.truncated = true;
      } catch (e) {
        authState = 'error';
        errorDetail = e instanceof ParseError ? `parse failed (${id}): ${e.message}` : String(e);
        if (settings.debugMode) {
          dumps.push({
            url: buildInboxQueriesUrl(id, settings.maxPrAge, page),
            status: outcome.status,
            body: outcome.body,
            at: Date.now(),
          });
        }
        break outer;
      }
    }
    sections.push(section);
  }

  if (dumps.length > 0) await saveDebugDump(dumps);

  if (authState === 'ok') {
    const snapshot: InboxSnapshot = { fetchedAt: Date.now(), sections, authState: 'ok' };
    await saveSnapshot(snapshot);
    await updateBadge(snapshot, settings);
    await syncTabs(settings.forceAlignOnRefresh);
  } else {
    // 失敗時は既存キャッシュのPRデータを保持しつつ状態だけ更新（popupにバナー表示）
    const prev = await loadSnapshot();
    const snapshot: InboxSnapshot = {
      fetchedAt: prev?.fetchedAt ?? 0,
      sections: prev?.sections ?? [],
      authState,
      errorDetail,
    };
    await saveSnapshot(snapshot);
    await updateBadge(snapshot, settings);
  }
}

/** 設定変更時: 再フェッチせずキャッシュからバッジ・タブ同期だけ再計算 */
export async function applySettingsChange(): Promise<void> {
  const settings = await loadSettings();
  const snapshot = await loadSnapshot();
  await updateBadge(snapshot, settings);
  await syncTabs();
}

/** デバッグ: 全既知セクションの生レスポンスを storage.local に保存 */
export async function runDebugDump(): Promise<{ saved: number }> {
  const settings = await loadSettings();
  const dumps: DebugDump[] = [];
  for (const { id } of KNOWN_SECTIONS) {
    const url = buildInboxQueriesUrl(id, settings.maxPrAge);
    const outcome = await fetchInboxQueries(id, settings.maxPrAge);
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
