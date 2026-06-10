import type { OwnedTab, SyncState, TabGroupColor } from '../types';
import { computeTabSyncPlan, type DesiredTab, type ExistingTabInfo } from '../lib/diff';
import { filterSections } from '../lib/filters';
import { isSamePr, prUrlKey } from '../lib/prUrl';
import { SECTION_ORDER } from '../lib/settings';
import { loadSettings, loadSnapshot, loadSyncState, saveSyncState } from '../storage';

const TAB_GROUP_ID_NONE = -1;

/**
 * snapshot とタブグループを同期する。
 * navigator.locks で多重実行（alarm × 手動REFRESH）を直列化。
 */
export async function syncTabs(): Promise<void> {
  await navigator.locks.request('tab-sync', async () => {
    try {
      await syncTabsLocked();
    } catch (e) {
      console.error('[prs-inbox] tab sync failed:', e);
    }
  });
}

async function syncTabsLocked(): Promise<void> {
  const settings = await loadSettings();
  const snapshot = await loadSnapshot();
  if (!snapshot || snapshot.authState !== 'ok') return;

  const state = await loadSyncState();

  // ---- desired を構築（有効セクション × フィルタ通過PR、セクション順 = 優先度）----
  const filtered = filterSections(snapshot.sections, settings.allowlist, settings.blocklist);
  const orderedSections = [...filtered].sort(
    (a, b) => orderIndex(a.id) - orderIndex(b.id),
  );
  const desired: DesiredTab[] = [];
  for (const section of orderedSections) {
    const cfg = settings.sections[section.id];
    if (!cfg?.enabled) continue;
    for (const pr of section.prs) {
      desired.push({
        prId: pr.id,
        url: pr.url,
        groupName: cfg.groupName,
        groupColor: cfg.groupColor,
      });
    }
  }

  // ---- Phase 0a: グループIDの検証・養子縁組 ----
  const groupIds: Record<string, number> = {};
  for (const [name, id] of Object.entries(state.groupIds)) {
    const g = await chrome.tabGroups.get(id).catch(() => null);
    if (g && g.title === name) groupIds[name] = id;
  }
  const desiredGroupNames = new Set(desired.map((d) => d.groupName));
  for (const name of desiredGroupNames) {
    if (groupIds[name] !== undefined) continue;
    const matches = await chrome.tabGroups.query({ title: name }).catch(() => []);
    const first = matches[0];
    if (first) groupIds[name] = first.id;
  }

  // ---- Phase 0b: 所有タブの検証（消滅/PR離脱/グループ外移動 → 所有権放棄）----
  const validOwned: OwnedTab[] = [];
  for (const ot of state.ownedTabs) {
    const tab = await chrome.tabs.get(ot.tabId).catch(() => null);
    if (!tab || tab.id === undefined) continue;
    const url = tab.url ?? tab.pendingUrl ?? '';
    if (!isSamePr(url, ot.prUrl)) continue; // ユーザーが別ページへ移動 → 閉じずに手放す
    const expectedGroupId = groupIds[ot.groupName];
    if (expectedGroupId === undefined || tab.groupId !== expectedGroupId) continue; // グループ外へ移動された
    validOwned.push(ot);
  }

  // ---- Phase 1: 純粋diff ----
  const allTabs = await chrome.tabs.query({ url: 'https://github.com/*' });
  const existingTabs: ExistingTabInfo[] = allTabs
    .filter((t) => t.id !== undefined && t.url && prUrlKey(t.url) !== null)
    .map((t) => ({ tabId: t.id!, url: t.url!, groupId: t.groupId ?? TAB_GROUP_ID_NONE }));

  const plan = computeTabSyncPlan({
    desired,
    ownedTabs: validOwned,
    existingTabs,
    groupIdByName: groupIds,
    autoClose: settings.autoCloseRemoved,
  });

  // ---- Phase 2: 実行 ----
  const nextOwned: OwnedTab[] = [...plan.keptOwned, ...plan.toAdopt];

  if (plan.toClose.length > 0) {
    await chrome.tabs.remove(plan.toClose).catch(() => {});
  }

  for (const mv of plan.toMove) {
    const groupId = await addTabToGroup(mv.tabId, mv.groupName, mv.groupColor, groupIds);
    if (groupId !== null) {
      nextOwned.push({
        tabId: mv.tabId,
        prId: mv.prId,
        prUrl: mv.prUrl,
        groupName: mv.groupName,
      });
    }
  }

  for (const d of plan.toCreate) {
    const tabId = await createTabInGroup(d, groupIds);
    if (tabId !== null) {
      nextOwned.push({ tabId, prId: d.prId, prUrl: d.url, groupName: d.groupName });
    }
  }

  const nextState: SyncState = {
    ownedTabs: nextOwned,
    groupIds,
    backoffUntil: state.backoffUntil,
  };
  await saveSyncState(nextState);
}

function orderIndex(id: string): number {
  const i = SECTION_ORDER.indexOf(id);
  return i === -1 ? SECTION_ORDER.length : i;
}

async function targetWindowId(groupName: string, groupIds: Record<string, number>): Promise<number | undefined> {
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
