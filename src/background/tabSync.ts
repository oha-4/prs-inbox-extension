import type { InboxSection, OwnedTab, PullRequest, SyncState, TabGroupColor } from '../types';
import {
  computeTabSyncPlan,
  forceExtraCloses,
  type DesiredTab,
  type ExistingTabInfo,
} from '../lib/diff';
import { filterSections } from '../lib/filters';
import { isSamePr, prUrlKey } from '../lib/prUrl';
import { SECTION_ORDER } from '../lib/settings';
import { sortPrs } from '../lib/sortPrs';
import { loadSettings, loadSnapshot, loadSyncState, saveSyncState } from '../storage';

const TAB_GROUP_ID_NONE = -1;

interface DesiredPlan {
  desired: DesiredTab[];
  /** groupName -> ソート済みのprId列（タブ並べ替えに使用） */
  orderByGroup: Map<string, string[]>;
}

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
  if (!snapshot || snapshot.authState !== 'ok') return;

  const state = await loadSyncState();
  const { desired, orderByGroup } = buildDesired(snapshot.sections, settings);

  // ---- Phase 0a: グループIDの検証・養子縁組 ----
  const groupIds: Record<string, number> = {};
  for (const [name, id] of Object.entries(state.groupIds)) {
    const g = await chrome.tabGroups.get(id).catch(() => null);
    if (g && g.title === name) groupIds[name] = id;
  }
  const desiredGroupNames = new Set(orderByGroup.keys());
  for (const name of desiredGroupNames) {
    if (groupIds[name] !== undefined) continue;
    const matches = await chrome.tabGroups.query({ title: name }).catch(() => []);
    const first = matches[0];
    if (first) groupIds[name] = first.id;
  }

  const resultOwned = force
    ? await executeForce(desired, groupIds)
    : await executeNormal(desired, groupIds, state, settings.autoCloseRemoved);

  // ---- 並べ替え: 各グループのタブをソート順に整列 ----
  const prIdToTabId = new Map(resultOwned.map((o) => [o.prId, o.tabId]));
  await reorderGroups(orderByGroup, groupIds, prIdToTabId);

  await saveSyncState({ ownedTabs: resultOwned, groupIds, backoffUntil: state.backoffUntil });
}

/** desired を「セクション優先度でグループ割当 → グループ内ソート」して構築 */
function buildDesired(
  sections: InboxSection[],
  settings: Awaited<ReturnType<typeof loadSettings>>,
): DesiredPlan {
  const filtered = filterSections(sections, settings.allowlist, settings.blocklist);
  const ordered = [...filtered].sort((a, b) => orderIndex(a.id) - orderIndex(b.id));

  const seen = new Set<string>();
  const byGroup = new Map<string, { pr: PullRequest; color: TabGroupColor }[]>();
  for (const section of ordered) {
    const cfg = settings.sections[section.id];
    if (!cfg?.enabled) continue;
    for (const pr of section.prs) {
      if (seen.has(pr.id)) continue;
      seen.add(pr.id);
      let entries = byGroup.get(cfg.groupName);
      if (!entries) {
        entries = [];
        byGroup.set(cfg.groupName, entries);
      }
      entries.push({ pr, color: cfg.groupColor });
    }
  }

  const desired: DesiredTab[] = [];
  const orderByGroup = new Map<string, string[]>();
  for (const [groupName, entries] of byGroup) {
    const colorByPr = new Map(entries.map((e) => [e.pr.id, e.color]));
    const sorted = sortPrs(
      entries.map((e) => e.pr),
      settings.sortCriteria,
    );
    const ids: string[] = [];
    for (const pr of sorted) {
      desired.push({
        prId: pr.id,
        url: pr.url,
        groupName,
        groupColor: colorByPr.get(pr.id)!,
      });
      ids.push(pr.id);
    }
    orderByGroup.set(groupName, ids);
  }
  return { desired, orderByGroup };
}

/** 通常同期: ユーザー操作を尊重しつつ差分適用 */
async function executeNormal(
  desired: DesiredTab[],
  groupIds: Record<string, number>,
  state: SyncState,
  autoClose: boolean,
): Promise<OwnedTab[]> {
  // 所有タブの検証（消滅/PR離脱/グループ外移動 → 所有権放棄）
  const validOwned: OwnedTab[] = [];
  for (const ot of state.ownedTabs) {
    const tab = await chrome.tabs.get(ot.tabId).catch(() => null);
    if (!tab || tab.id === undefined) continue;
    const url = tab.url ?? tab.pendingUrl ?? '';
    if (!isSamePr(url, ot.prUrl)) continue;
    const expectedGroupId = groupIds[ot.groupName];
    if (expectedGroupId === undefined || tab.groupId !== expectedGroupId) continue;
    validOwned.push(ot);
  }

  const allTabs = await chrome.tabs.query({ url: 'https://github.com/*' });
  const existingTabs: ExistingTabInfo[] = allTabs
    .filter((t) => t.id !== undefined && t.url && prUrlKey(t.url) !== null)
    .map((t) => ({ tabId: t.id!, url: t.url!, groupId: t.groupId ?? TAB_GROUP_ID_NONE }));

  const plan = computeTabSyncPlan({
    desired,
    ownedTabs: validOwned,
    existingTabs,
    groupIdByName: groupIds,
    autoClose,
  });

  const nextOwned: OwnedTab[] = [...plan.keptOwned, ...plan.toAdopt];
  if (plan.toClose.length > 0) await chrome.tabs.remove(plan.toClose).catch(() => {});

  for (const mv of plan.toMove) {
    const groupId = await addTabToGroup(mv.tabId, mv.groupName, mv.groupColor, groupIds);
    if (groupId !== null) {
      nextOwned.push({ tabId: mv.tabId, prId: mv.prId, prUrl: mv.prUrl, groupName: mv.groupName });
    }
  }
  for (const d of plan.toCreate) {
    const tabId = await createTabInGroup(d, groupIds);
    if (tabId !== null) {
      nextOwned.push({ tabId, prId: d.prId, prUrl: d.url, groupName: d.groupName });
    }
  }
  return nextOwned;
}

/** 強制整列: 管理グループの中身を desired に一致させる（ユーザー追加/削除を無視） */
async function executeForce(
  desired: DesiredTab[],
  groupIds: Record<string, number>,
): Promise<OwnedTab[]> {
  const managedIds = new Set(Object.values(groupIds));
  const nameByGroupId = new Map(Object.entries(groupIds).map(([name, id]) => [id, name]));

  const allTabs = await chrome.tabs.query({});
  const managedTabs = allTabs
    .filter((t) => t.id !== undefined && t.groupId !== undefined && managedIds.has(t.groupId))
    .map((t) => ({
      tabId: t.id!,
      url: t.url ?? t.pendingUrl ?? '',
      groupName: nameByGroupId.get(t.groupId!)!,
    }));

  const closes = forceExtraCloses(managedTabs, desired);
  if (closes.length > 0) await chrome.tabs.remove(closes).catch(() => {});

  // 残った管理タブを PR キーで引けるように
  const closedSet = new Set(closes);
  const remainingByKey = new Map<string, number>();
  for (const t of managedTabs) {
    if (closedSet.has(t.tabId)) continue;
    const key = prUrlKey(t.url);
    if (key && !remainingByKey.has(key)) remainingByKey.set(key, t.tabId);
  }

  const owned: OwnedTab[] = [];
  for (const d of desired) {
    const key = prUrlKey(d.url);
    const existing = key ? remainingByKey.get(key) : undefined;
    if (existing !== undefined) {
      owned.push({ tabId: existing, prId: d.prId, prUrl: d.url, groupName: d.groupName });
      if (key) remainingByKey.delete(key);
    } else {
      const tabId = await createTabInGroup(d, groupIds);
      if (tabId !== null) {
        owned.push({ tabId, prId: d.prId, prUrl: d.url, groupName: d.groupName });
      }
    }
  }
  return owned;
}

/** 各グループのタブを orderByGroup の順に整列（ベストエフォート） */
async function reorderGroups(
  orderByGroup: Map<string, string[]>,
  groupIds: Record<string, number>,
  prIdToTabId: Map<string, number>,
): Promise<void> {
  for (const [groupName, prIds] of orderByGroup) {
    const gid = groupIds[groupName];
    if (gid === undefined) continue;
    const orderedTabIds = prIds
      .map((id) => prIdToTabId.get(id))
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
      console.warn('[prs-inbox] reorder failed for group', groupName, e);
    }
  }
}

function orderIndex(id: string): number {
  const i = SECTION_ORDER.indexOf(id);
  return i === -1 ? SECTION_ORDER.length : i;
}

async function targetWindowId(
  groupName: string,
  groupIds: Record<string, number>,
): Promise<number | undefined> {
  const gid = groupIds[groupName];
  if (gid !== undefined) {
    const g = await chrome.tabGroups.get(gid).catch(() => null);
    if (g) return g.windowId;
  }
  const w = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
  return w?.id;
}

/** タブを名前のグループへ入れる（無ければ作成してtitle/colorを設定） */
async function addTabToGroup(
  tabId: number,
  groupName: string,
  groupColor: TabGroupColor,
  groupIds: Record<string, number>,
): Promise<number | null> {
  try {
    const existing = groupIds[groupName];
    if (existing !== undefined) {
      await chrome.tabs.group({ tabIds: [tabId], groupId: existing });
      return existing;
    }
    const windowId = await targetWindowId(groupName, groupIds);
    const groupId = await chrome.tabs.group({
      tabIds: [tabId],
      ...(windowId !== undefined ? { createProperties: { windowId } } : {}),
    });
    await chrome.tabGroups.update(groupId, {
      title: groupName,
      color: groupColor,
      collapsed: true,
    });
    groupIds[groupName] = groupId;
    return groupId;
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
async function createTabInGroup(
  d: DesiredTab,
  groupIds: Record<string, number>,
): Promise<number | null> {
  try {
    const windowId = await targetWindowId(d.groupName, groupIds);
    const tab = await chrome.tabs.create({
      url: d.url,
      active: false,
      ...(windowId !== undefined ? { windowId } : {}),
    });
    if (tab.id === undefined) return null;
    await addTabToGroup(tab.id, d.groupName, d.groupColor, groupIds);
    return tab.id;
  } catch (e) {
    console.warn('[prs-inbox] failed to create tab for', d.url, e);
    return null;
  }
}
