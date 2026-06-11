import type { OwnedTab, TabGroupColor } from '../types';
import { prUrlKey } from './prUrl';

export interface DesiredTab {
  prId: string;
  url: string;
  groupName: string;
  groupColor: TabGroupColor;
}

export interface ExistingTabInfo {
  tabId: number;
  url: string;
  /** chrome.tabs.Tab.groupId（未所属は -1） */
  groupId: number;
}

export interface TabSyncPlan {
  /** 新規タブを作成してグループに入れる */
  toCreate: DesiredTab[];
  /** ターゲットグループ内に既にある未所有タブを所有化する */
  toAdopt: OwnedTab[];
  /** 所有タブを別グループへ移動（セクションのグループ設定変更時） */
  toMove: {
    tabId: number;
    prId: string;
    prUrl: string;
    groupName: string;
    groupColor: TabGroupColor;
  }[];
  /** inboxから消えたPRの所有タブを閉じる（autoClose時） */
  toClose: number[];
  /** inboxから消えたが閉じない（autoCloseオフ）→ 所有権だけ手放すprId */
  toRelease: string[];
  /** 引き続き所有し続けるタブ */
  keptOwned: OwnedTab[];
}

/**
 * 純粋なタブ同期差分計算。chrome.* には触らない。
 *
 * 前提: ownedTabs は呼び出し側で検証済み（タブが生存し、URLがPR上のまま、
 * 想定グループ内に居る）。検証で外れたタブはここに渡さない。
 *
 * 不変条件:
 * - 拡張が所有していないタブは絶対に閉じない
 * - 既存のPRタブがターゲットグループの外にある場合は一切触らない（重複作成もしない）
 */
export function computeTabSyncPlan(input: {
  desired: DesiredTab[];
  ownedTabs: OwnedTab[];
  existingTabs: ExistingTabInfo[];
  groupIdByName: Record<string, number>;
  autoClose: boolean;
}): TabSyncPlan {
  // 同一PRが複数セクションに出る場合は先勝ち（セクション順 = 優先度）
  const desiredByPr = new Map<string, DesiredTab>();
  for (const d of input.desired) {
    if (!desiredByPr.has(d.prId)) desiredByPr.set(d.prId, d);
  }

  const ownedByPr = new Map(input.ownedTabs.map((t) => [t.prId, t]));
  const ownedTabIds = new Set(input.ownedTabs.map((t) => t.tabId));

  const plan: TabSyncPlan = {
    toCreate: [],
    toAdopt: [],
    toMove: [],
    toClose: [],
    toRelease: [],
    keptOwned: [],
  };

  for (const d of desiredByPr.values()) {
    const owned = ownedByPr.get(d.prId);
    if (owned) {
      if (owned.groupName !== d.groupName) {
        plan.toMove.push({
          tabId: owned.tabId,
          prId: d.prId,
          prUrl: owned.prUrl,
          groupName: d.groupName,
          groupColor: d.groupColor,
        });
      } else {
        plan.keptOwned.push(owned);
      }
      continue;
    }

    const key = prUrlKey(d.url);
    const candidates = input.existingTabs.filter(
      (t) => !ownedTabIds.has(t.tabId) && key !== null && prUrlKey(t.url) === key,
    );
    if (candidates.length > 0) {
      const targetGroupId = input.groupIdByName[d.groupName];
      const inTargetGroup =
        targetGroupId !== undefined
          ? candidates.find((t) => t.groupId === targetGroupId)
          : undefined;
      if (inTargetGroup) {
        plan.toAdopt.push({
          tabId: inTargetGroup.tabId,
          prId: d.prId,
          prUrl: d.url,
          groupName: d.groupName,
        });
      }
      // グループ外に既存タブがある場合は何もしない（ユーザーの意図を尊重）
      continue;
    }

    plan.toCreate.push(d);
  }

  for (const owned of input.ownedTabs) {
    if (desiredByPr.has(owned.prId)) continue;
    if (input.autoClose) plan.toClose.push(owned.tabId);
    else plan.toRelease.push(owned.prId);
  }

  return plan;
}

/**
 * 強制整列モードで閉じるべきタブ。管理対象グループ内にあって、そのグループの
 * desired集合に一致しないタブ（ユーザーが足したタブ・PR以外・別グループ行きのPR）を
 * すべて対象にする。所有関係は問わない。
 */
export function forceExtraCloses(
  managedTabs: { tabId: number; url: string; groupName: string }[],
  desired: { url: string; groupName: string }[],
): number[] {
  const desiredKeysByGroup = new Map<string, Set<string>>();
  for (const d of desired) {
    const key = prUrlKey(d.url);
    if (!key) continue;
    let set = desiredKeysByGroup.get(d.groupName);
    if (!set) {
      set = new Set();
      desiredKeysByGroup.set(d.groupName, set);
    }
    set.add(key);
  }
  const close: number[] = [];
  for (const t of managedTabs) {
    const key = prUrlKey(t.url);
    const set = desiredKeysByGroup.get(t.groupName);
    if (!key || !set?.has(key)) close.push(t.tabId);
  }
  return close;
}
