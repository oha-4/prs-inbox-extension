import type { OwnedTab } from '../types';
import { isPlaceholderId, placeholderKey, tabKey } from './placeholder';

export interface DesiredTab {
  prId: string;
  url: string;
  /** SyncGroup.id */
  groupId: string;
  /** Chrome タブグループの title（作成時に設定。色は設定しない） */
  groupTitle: string;
}

export interface ExistingTabInfo {
  tabId: number;
  url: string;
  /** chrome.tabs.Tab.groupId（未所属は -1） */
  groupId: number;
  /** ピン留めタブか。Chrome 仕様上ピン留めするとグループから外れる（chrome.tabs.Tab.pinned） */
  pinned?: boolean;
}

export interface TabSyncPlan {
  /** 新規タブを作成してグループに入れる */
  toCreate: DesiredTab[];
  /** ターゲットグループ内に既にある未所有タブを所有化する */
  toAdopt: OwnedTab[];
  /** 所有タブを別グループへ移動（inbox のグループ割当変更時。再読込を避ける） */
  toMove: {
    tabId: number;
    prId: string;
    prUrl: string;
    groupId: string;
    groupTitle: string;
  }[];
  /** inboxから消えたPRの所有タブを閉じる（autoClose時） */
  toClose: number[];
  /** inboxから消えたが閉じない（autoCloseオフ）→ 所有権だけ手放すエントリ */
  toRelease: { groupId: string; prId: string }[];
  /** 引き続き所有し続けるタブ */
  keptOwned: OwnedTab[];
}

/** 複合キー: 同一PRでもグループごとに独立したタブを持つ */
function gpKey(groupId: string, prId: string): string {
  return `${groupId}\0${prId}`;
}

/**
 * 純粋なタブ同期差分計算。chrome.* には触らない。
 *
 * 前提: ownedTabs は呼び出し側で検証済み（タブが生存し、URLがPR上のまま、
 * 想定グループ内に居る）。検証で外れたタブはここに渡さない。
 *
 * 識別子は (groupId, prId) の複合キー。同じ inbox を複数グループに割り当てられる
 * ため、同一PRの desired がグループごとに1エントリずつ並びうる（意図どおり重複）。
 *
 * 不変条件:
 * - 拡張が所有していないタブは絶対に閉じない
 * - 未所有の一致タブが管理外（どの管理グループにも属さない場所）にある場合は
 *   一切触らず、全グループで作成を抑止する（ユーザーの意図を尊重）
 * - 別の管理グループ内にある一致タブは作成を妨げない（そのグループ側の
 *   desired が所有/採用しているはずのタブ）
 *
 * プレースホルダ（keepEmptyGroups）: desired にプレースホルダURLが混ざる。
 * 所有プレースホルダが不要になったら autoClose に関係なく常に閉じる
 * （ユーザーのPRタブではないので release すると永久に残る）。作成は
 * 「グループにタブが残らない場合」のみ（released タブ等が生かすなら不要）。
 */
export function computeTabSyncPlan(input: {
  desired: DesiredTab[];
  ownedTabs: OwnedTab[];
  existingTabs: ExistingTabInfo[];
  /** SyncGroup.id → Chrome グループID（このrunで解決済みのもののみ） */
  chromeGroupIdByGroup: Record<string, number>;
  autoClose: boolean;
}): TabSyncPlan {
  // buildDesired 側でグループ内重複排除済みだが、防御的に先勝ちで潰す
  const desiredByKey = new Map<string, DesiredTab>();
  for (const d of input.desired) {
    const key = gpKey(d.groupId, d.prId);
    if (!desiredByKey.has(key)) desiredByKey.set(key, d);
  }

  const ownedByKey = new Map(input.ownedTabs.map((t) => [gpKey(t.groupId, t.prId), t]));
  const ownedTabIds = new Set(input.ownedTabs.map((t) => t.tabId));
  const managedChromeIds = new Set(Object.values(input.chromeGroupIdByGroup));
  // 採用は1タブ=1エントリ（同一PRを欲しがる2グループが同じタブを取り合わない）
  const claimedTabIds = new Set<number>();

  const plan: TabSyncPlan = {
    toCreate: [],
    toAdopt: [],
    toMove: [],
    toClose: [],
    toRelease: [],
    keptOwned: [],
  };

  // ---- 1. 所有しているが desired にないタブ ----
  // プレースホルダの作成判定（パス3）が toClose/toMove を参照するため先に確定させる。
  // move ペアリング（パス2.5）用に prId → stale タブも記録する。
  const staleClosedByPr = new Map<string, OwnedTab>();
  const staleReleasedByPr = new Map<string, OwnedTab>();
  for (const owned of input.ownedTabs) {
    if (desiredByKey.has(gpKey(owned.groupId, owned.prId))) continue;
    if (isPlaceholderId(owned.prId)) plan.toClose.push(owned.tabId);
    else if (input.autoClose) {
      plan.toClose.push(owned.tabId);
      if (!staleClosedByPr.has(owned.prId)) staleClosedByPr.set(owned.prId, owned);
    } else {
      plan.toRelease.push({ groupId: owned.groupId, prId: owned.prId });
      if (!staleReleasedByPr.has(owned.prId)) staleReleasedByPr.set(owned.prId, owned);
    }
  }

  // ---- 2. PR の desired ----
  const placeholders: DesiredTab[] = [];
  for (const d of desiredByKey.values()) {
    if (placeholderKey(d.url) !== null) {
      placeholders.push(d);
      continue;
    }
    const owned = ownedByKey.get(gpKey(d.groupId, d.prId));
    if (owned) {
      plan.keptOwned.push(owned);
      continue;
    }

    const key = tabKey(d.url);
    const candidates = input.existingTabs.filter(
      (t) =>
        !ownedTabIds.has(t.tabId) &&
        !claimedTabIds.has(t.tabId) &&
        key !== null &&
        tabKey(t.url) === key,
    );
    const ownChromeId = input.chromeGroupIdByGroup[d.groupId];
    const inOwnGroup =
      ownChromeId !== undefined ? candidates.find((t) => t.groupId === ownChromeId) : undefined;
    if (inOwnGroup) {
      claimedTabIds.add(inOwnGroup.tabId);
      plan.toAdopt.push({
        tabId: inOwnGroup.tabId,
        prId: d.prId,
        prUrl: d.url,
        groupId: d.groupId,
      });
      continue;
    }
    // 管理外に一致タブ → 触らない・作らない（別の管理グループ内なら妨げない）
    if (candidates.some((t) => !managedChromeIds.has(t.groupId))) continue;

    plan.toCreate.push(d);
  }

  // ---- 2.5. move ペアリング ----
  // 複合キーでは「グループAで不要 + グループBで必要」が close+create に分解される。
  // 同一PRの stale タブと toCreate をペアにして move へ変換し、タブ再読込を避ける。
  // close 予定を優先的に再利用（release は「ユーザーに返す」なので次点）。
  if (plan.toCreate.length > 0 && (staleClosedByPr.size > 0 || staleReleasedByPr.size > 0)) {
    const remainingCreates: DesiredTab[] = [];
    for (const d of plan.toCreate) {
      const fromClose = staleClosedByPr.get(d.prId);
      const fromRelease = fromClose ? undefined : staleReleasedByPr.get(d.prId);
      const stale = fromClose ?? fromRelease;
      if (!stale) {
        remainingCreates.push(d);
        continue;
      }
      plan.toMove.push({
        tabId: stale.tabId,
        prId: d.prId,
        prUrl: stale.prUrl,
        groupId: d.groupId,
        groupTitle: d.groupTitle,
      });
      if (fromClose) {
        staleClosedByPr.delete(d.prId);
        plan.toClose = plan.toClose.filter((id) => id !== stale.tabId);
      } else {
        staleReleasedByPr.delete(d.prId);
        plan.toRelease = plan.toRelease.filter(
          (r) => !(r.groupId === stale.groupId && r.prId === stale.prId),
        );
      }
    }
    plan.toCreate = remainingCreates;
  }

  // ---- 3. プレースホルダの desired ----
  // 閉じる/他グループへ移る予定のタブを除いてグループにタブが残るなら、
  // グループは消滅しないのでプレースホルダは作らない。
  const leaving = new Set<number>([...plan.toClose, ...plan.toMove.map((m) => m.tabId)]);
  for (const d of placeholders) {
    const owned = ownedByKey.get(gpKey(d.groupId, d.prId));
    if (owned) {
      // prId にグループIDが埋まっているので move は発生しない
      plan.keptOwned.push(owned);
      continue;
    }
    const key = placeholderKey(d.url);
    const ownChromeId = input.chromeGroupIdByGroup[d.groupId];
    // ピン留めタブは除外する。Chrome 仕様上ピン留めするとグループから外れ、
    // owned 検証で release される。それが candidates に残ると「グループ外に一致
    // タブがある」として新規プレースホルダの作成を抑止し、keepEmptyGroups でも
    // グループが空のまま消滅してしまう（issue #73）。ユーザーが明示的にピン留め
    // したタブなので閉じはせず、無視して新しいプレースホルダを作る。
    const candidates = input.existingTabs.filter(
      (t) =>
        !ownedTabIds.has(t.tabId) &&
        !claimedTabIds.has(t.tabId) &&
        !t.pinned &&
        key !== null &&
        tabKey(t.url) === key,
    );
    const inOwnGroup =
      ownChromeId !== undefined ? candidates.find((t) => t.groupId === ownChromeId) : undefined;
    if (inOwnGroup) {
      claimedTabIds.add(inOwnGroup.tabId);
      plan.toAdopt.push({
        tabId: inOwnGroup.tabId,
        prId: d.prId,
        prUrl: d.url,
        groupId: d.groupId,
      });
      continue;
    }
    if (candidates.length > 0) continue; // グループ外のプレースホルダは触らない
    const groupStillPopulated =
      ownChromeId !== undefined &&
      input.existingTabs.some((t) => t.groupId === ownChromeId && !leaving.has(t.tabId));
    if (!groupStillPopulated) plan.toCreate.push(d);
  }

  return plan;
}

/**
 * 強制整列モードで閉じるべきタブ。管理対象グループ内にあって、そのグループの
 * desired集合に一致しないタブ（ユーザーが足したタブ・PR以外・別グループ行きのPR）を
 * すべて対象にする。所有関係は問わない。キー集合はグループ単位なので、
 * 同一PRが2グループで desired なら両方のタブが残る。
 *
 * 同一グループ内に同じキー（同じPR/プレースホルダ）のタブが複数ある場合は
 * 先頭の1枚だけ残し、残りは重複として閉じる。desired にあるPRの重複タブ
 * （ユーザーが同じPRをもう1枚開いた等）が孤児として残るのを防ぐ
 * （「強制一致」＝各PRちょうど1枚を保証）。
 */
export function forceExtraCloses(
  managedTabs: { tabId: number; url: string; groupId: string }[],
  desired: { url: string; groupId: string }[],
): number[] {
  const desiredKeysByGroup = new Map<string, Set<string>>();
  for (const d of desired) {
    const key = tabKey(d.url);
    if (!key) continue;
    let set = desiredKeysByGroup.get(d.groupId);
    if (!set) {
      set = new Set();
      desiredKeysByGroup.set(d.groupId, set);
    }
    set.add(key);
  }
  const close: number[] = [];
  // グループごとに「既に残す1枚を確保したキー」を追跡し、2枚目以降は閉じる
  const keptByGroup = new Map<string, Set<string>>();
  for (const t of managedTabs) {
    const key = tabKey(t.url);
    const set = desiredKeysByGroup.get(t.groupId);
    if (!key || !set?.has(key)) {
      close.push(t.tabId);
      continue;
    }
    let kept = keptByGroup.get(t.groupId);
    if (!kept) {
      kept = new Set();
      keptByGroup.set(t.groupId, kept);
    }
    if (kept.has(key)) {
      close.push(t.tabId); // 同一キーの重複 → 先頭以外は閉じる
    } else {
      kept.add(key);
    }
  }
  return close;
}
