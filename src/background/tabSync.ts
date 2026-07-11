import type { OwnedTab, Settings, SyncState } from '../types';
import { buildDesired } from '../lib/buildDesired';
import {
  computeTabSyncPlan,
  forceExtraCloses,
  type DesiredTab,
  type ExistingTabInfo,
} from '../lib/diff';
import { tabKey } from '../lib/placeholder';
import { activeSyncGroups } from '../lib/settings';
import { loadSettings, loadSnapshot, loadSyncState, saveSyncState } from '../storage';

const TAB_GROUP_ID_NONE = -1;

/** SyncGroup.id -> 解決済みの Chrome グループIDと現在の title */
type ResolvedGroups = SyncState['groups'];

/**
 * snapshot とタブグループを同期する。
 * force=true: 管理対象グループの中身を desired に強制一致（ユーザー追加/削除を無視）。
 * navigator.locks で多重実行（alarm × 手動）を直列化。
 */
export async function syncTabs(force = false): Promise<void> {
  await navigator.locks.request('tab-sync', async () => {
    try {
      await syncTabsLocked(force);
    } catch (e) {
      console.error('[prs-inbox] tab sync failed:', e);
    }
  });
}

async function syncTabsLocked(force: boolean): Promise<void> {
  const settings = await loadSettings();
  const snapshot = await loadSnapshot();
  if (snapshot?.authState !== 'ok') return;

  const state = await loadSyncState();
  const { desired, orderByGroup } = buildDesired(snapshot.sections, settings);

  const groups = await resolveGroups(settings, state, orderByGroup);

  // 逐次保存（チェックポイント）。MV3 の service worker は作成ループの途中でも
  // kill されうるため、「最後に1回だけ保存」方式だと作成済みタブ/グループが
  // 未登録のまま残り、次回同期で同一PRの重複タブが生まれうる（issue #23）。
  // 採用/作成/移動のたびに ownedTabs と（新規作成で変化する）groups を保存する。
  // ロック内なので自己競合はなく、storage.session は quota/レート制限が実質ない。
  const persist = (ownedTabs: OwnedTab[]): Promise<void> =>
    saveSyncState({ ownedTabs, groups, backoffUntil: state.backoffUntil });

  const resultOwned = force
    ? await executeForce(desired, groups, persist)
    : await executeNormal(desired, groups, state, settings.autoCloseRemoved, persist);

  // ---- 並べ替え: 各グループのタブをソート順に整列 ----
  const keyToTabId = new Map(resultOwned.map((o) => [`${o.groupId} ${o.prId}`, o.tabId]));
  await reorderGroups(orderByGroup, groups, keyToTabId);

  await saveSyncState({ ownedTabs: resultOwned, groups, backoffUntil: state.backoffUntil });
}

/**
 * Phase 0a: 設定グループ → Chrome グループの解決。
 * - 保存済み id が生きていて title が設定名のまま → 継続
 * - title が「最後にこちらが設定した名前」のまま → 設定側リネームなので retitle して継続
 * - それ以外（ユーザーが chrome 側でリネーム・グループ消滅） → 所有権解放
 * - 未解決の desired グループは title 一致で養子縁組。ただし同名2グループが
 *   同じ chrome グループを取り合わないよう、このrunで claim 済みの id は除外。
 */
async function resolveGroups(
  settings: Settings,
  state: SyncState,
  orderByGroup: Map<string, string[]>,
): Promise<ResolvedGroups> {
  const groups: ResolvedGroups = {};
  const claimed = new Set<number>();
  for (const g of activeSyncGroups(settings)) {
    const prev = state.groups[g.id];
    if (prev) {
      const cg = await chrome.tabGroups.get(prev.chromeGroupId).catch(() => null);
      if (cg && !claimed.has(cg.id)) {
        if (cg.title === g.name) {
          groups[g.id] = { chromeGroupId: cg.id, title: g.name };
          claimed.add(cg.id);
          continue;
        }
        if (cg.title === prev.title) {
          await chrome.tabGroups.update(cg.id, { title: g.name }).catch(() => {});
          groups[g.id] = { chromeGroupId: cg.id, title: g.name };
          claimed.add(cg.id);
          continue;
        }
      }
    }
    if (!orderByGroup.has(g.id)) continue;
    const matches = await chrome.tabGroups.query({ title: g.name }).catch(() => []);
    const first = matches.find((m) => !claimed.has(m.id));
    if (first) {
      groups[g.id] = { chromeGroupId: first.id, title: g.name };
      claimed.add(first.id);
    }
  }
  return groups;
}

function chromeIdsByGroup(groups: ResolvedGroups): Record<string, number> {
  return Object.fromEntries(Object.entries(groups).map(([id, g]) => [id, g.chromeGroupId]));
}

/** 通常同期: ユーザー操作を尊重しつつ差分適用 */
async function executeNormal(
  desired: DesiredTab[],
  groups: ResolvedGroups,
  state: SyncState,
  autoClose: boolean,
  persist: (ownedTabs: OwnedTab[]) => Promise<void>,
): Promise<OwnedTab[]> {
  // 所有タブの検証（消滅/PR・プレースホルダ離脱/グループ外移動 → 所有権放棄）
  const validOwned: OwnedTab[] = [];
  for (const ot of state.ownedTabs) {
    const tab = await chrome.tabs.get(ot.tabId).catch(() => null);
    if (!tab || tab.id === undefined) continue;
    const expectedKey = tabKey(ot.prUrl);
    if (expectedKey === null || tabKey(tabUrl(tab)) !== expectedKey) continue;
    const expectedGroupId = groups[ot.groupId]?.chromeGroupId;
    if (expectedGroupId === undefined || tab.groupId !== expectedGroupId) continue;
    validOwned.push(ot);
  }

  // 全タブを渡す（url フィルタ付き query は読み込み中のタブを取りこぼす上、
  // プレースホルダ作成可否の「グループにタブが残るか」判定には任意のタブも必要）
  const allTabs = await chrome.tabs.query({});
  const existingTabs: ExistingTabInfo[] = allTabs
    .filter((t) => t.id !== undefined)
    .map((t) => ({ tabId: t.id!, url: tabUrl(t), groupId: t.groupId ?? TAB_GROUP_ID_NONE }));

  const plan = computeTabSyncPlan({
    desired,
    ownedTabs: validOwned,
    existingTabs,
    chromeGroupIdByGroup: chromeIdsByGroup(groups),
    autoClose,
  });

  const nextOwned: OwnedTab[] = [...plan.keptOwned, ...plan.toAdopt];
  // 採用（自己修復: 前回同期が途中で落ちて未登録になったタブの回収）は chrome
  // 操作を伴わない所有権登録。作成/移動ループが途中で kill されても採用結果が
  // 失われないよう、ループ前にチェックポイントする。
  if (plan.toAdopt.length > 0) await persist(nextOwned);

  // 作成・移動が先、close は最後。close を先にすると最後のタブが閉じた瞬間に
  // グループが消滅し、プレースホルダが末尾の新規グループに入って位置が失われる。
  // 3集合は互いに素で close 対象IDは確定済みのため順序変更は安全。
  for (const mv of plan.toMove) {
    const groupId = await addTabToGroup(mv.tabId, mv.groupId, mv.groupTitle, groups);
    if (groupId !== null) {
      nextOwned.push({ tabId: mv.tabId, prId: mv.prId, prUrl: mv.prUrl, groupId: mv.groupId });
      await persist(nextOwned);
    }
  }
  for (const d of plan.toCreate) {
    const tabId = await createTabInGroup(d, groups);
    if (tabId !== null) {
      nextOwned.push({ tabId, prId: d.prId, prUrl: d.url, groupId: d.groupId });
      await persist(nextOwned);
    }
  }
  if (plan.toClose.length > 0) await chrome.tabs.remove(plan.toClose).catch(() => {});
  return nextOwned;
}

/** 強制整列: 管理グループの中身を desired に一致させる（ユーザー追加/削除を無視） */
async function executeForce(
  desired: DesiredTab[],
  groups: ResolvedGroups,
  persist: (ownedTabs: OwnedTab[]) => Promise<void>,
): Promise<OwnedTab[]> {
  const settingsGroupIdByChromeId = new Map(
    Object.entries(groups).map(([id, g]) => [g.chromeGroupId, id]),
  );

  const allTabs = await chrome.tabs.query({});
  const managedTabs = allTabs
    .filter(
      (t) =>
        t.id !== undefined && t.groupId !== undefined && settingsGroupIdByChromeId.has(t.groupId),
    )
    .map((t) => ({
      tabId: t.id!,
      url: tabUrl(t),
      groupId: settingsGroupIdByChromeId.get(t.groupId!)!,
    }));

  // close は最後に実行する（先に閉じるとグループが一瞬空になり消滅→位置が失われる）。
  // remainingByGroup は close 前のスナップショット − close 予定で作るため結果は変わらない。
  const closes = forceExtraCloses(managedTabs, desired);
  const closedSet = new Set(closes);
  // グループ単位で残存タブを引き当てる（同一PRが複数グループで desired でも
  // それぞれ自グループのタブを掴む）
  const remainingByGroup = new Map<string, Map<string, number>>();
  for (const t of managedTabs) {
    if (closedSet.has(t.tabId)) continue;
    const key = tabKey(t.url);
    if (!key) continue;
    let byKey = remainingByGroup.get(t.groupId);
    if (!byKey) {
      byKey = new Map();
      remainingByGroup.set(t.groupId, byKey);
    }
    if (!byKey.has(key)) byKey.set(key, t.tabId);
  }

  const owned: OwnedTab[] = [];
  for (const d of desired) {
    const key = tabKey(d.url);
    const byKey = key ? remainingByGroup.get(d.groupId) : undefined;
    const existing = key ? byKey?.get(key) : undefined;
    if (existing !== undefined) {
      owned.push({ tabId: existing, prId: d.prId, prUrl: d.url, groupId: d.groupId });
      if (key) byKey?.delete(key);
    } else {
      const tabId = await createTabInGroup(d, groups);
      if (tabId !== null) {
        owned.push({ tabId, prId: d.prId, prUrl: d.url, groupId: d.groupId });
        await persist(owned);
      }
    }
  }
  if (closes.length > 0) await chrome.tabs.remove(closes).catch(() => {});
  return owned;
}

/** 各グループのタブを orderByGroup の順に整列（ベストエフォート） */
async function reorderGroups(
  orderByGroup: Map<string, string[]>,
  groups: ResolvedGroups,
  keyToTabId: Map<string, number>,
): Promise<void> {
  for (const [groupId, prIds] of orderByGroup) {
    const gid = groups[groupId]?.chromeGroupId;
    if (gid === undefined) continue;
    const orderedTabIds = prIds
      .map((id) => keyToTabId.get(`${groupId} ${id}`))
      .filter((x): x is number => x !== undefined);
    if (orderedTabIds.length < 2) continue;
    try {
      const groupTabs = await chrome.tabs.query({ groupId: gid });
      if (groupTabs.length === 0) continue;
      const base = Math.min(...groupTabs.map((t) => t.index));
      for (let i = 0; i < orderedTabIds.length; i++) {
        await chrome.tabs.move(orderedTabIds[i]!, { index: base + i });
      }
    } catch (e) {
      console.warn('[prs-inbox] reorder failed for group', groupId, e);
    }
  }
}

/** 読み込み中のタブは url が空文字（undefined ではない）のため pendingUrl まで見る */
function tabUrl(tab: chrome.tabs.Tab): string {
  return tab.url || tab.pendingUrl || '';
}

/**
 * タブ/グループを置くべきウィンドウ。自グループ → 他の管理グループ →
 * 最後にフォーカスされた通常ウィンドウ、の順。新規グループが既存の管理
 * グループと別ウィンドウへ散らばるのを防ぐ。
 */
async function targetWindowId(
  groupId: string,
  groups: ResolvedGroups,
): Promise<number | undefined> {
  const own = groups[groupId];
  if (own) {
    const g = await chrome.tabGroups.get(own.chromeGroupId).catch(() => null);
    if (g) return g.windowId;
  }
  for (const [id, entry] of Object.entries(groups)) {
    if (id === groupId) continue;
    const g = await chrome.tabGroups.get(entry.chromeGroupId).catch(() => null);
    if (g) return g.windowId;
  }
  const w = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
  return w?.id;
}

/**
 * タブを設定グループの chrome グループへ入れる（無ければ作成して title を設定）。
 * 色は設定しない — Chrome の自動割当とユーザーの手動変更に任せる。
 */
async function addTabToGroup(
  tabId: number,
  groupId: string,
  groupTitle: string,
  groups: ResolvedGroups,
): Promise<number | null> {
  try {
    const existing = groups[groupId];
    if (existing) {
      await chrome.tabs.group({ tabIds: [tabId], groupId: existing.chromeGroupId });
      return existing.chromeGroupId;
    }
    const windowId = await targetWindowId(groupId, groups);
    const chromeGroupId = await chrome.tabs.group({
      tabIds: [tabId],
      ...(windowId !== undefined ? { createProperties: { windowId } } : {}),
    });
    await chrome.tabGroups.update(chromeGroupId, { title: groupTitle, collapsed: true });
    groups[groupId] = { chromeGroupId, title: groupTitle };
    return chromeGroupId;
  } catch (e) {
    console.warn('[prs-inbox] failed to group tab', tabId, e);
    return null;
  }
}

/**
 * 非アクティブでタブを作成 → グループへ。
 * discard はしない（裏でロードさせPRタイトルをタブに反映させるため）。
 * メモリ圧迫時は Chrome が自動でタブを破棄する。
 */
async function createTabInGroup(d: DesiredTab, groups: ResolvedGroups): Promise<number | null> {
  try {
    const windowId = await targetWindowId(d.groupId, groups);
    const tab = await chrome.tabs.create({
      url: d.url,
      active: false,
      ...(windowId !== undefined ? { windowId } : {}),
    });
    if (tab.id === undefined) return null;
    await addTabToGroup(tab.id, d.groupId, d.groupTitle, groups);
    return tab.id;
  } catch (e) {
    console.warn('[prs-inbox] failed to create tab for', d.url, e);
    return null;
  }
}
