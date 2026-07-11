import type { ClickBehavior, OwnedTab } from '../types';
import { isSamePr } from './prUrl';

/** クリックで実際に取る操作。副作用側（popup/lib/openPr.ts）がこの値で分岐する */
export type ClickAction = 'foreground' | 'background' | 'reuseSynced';

/**
 * タブ同期が所有するタブ（SyncState.ownedTabs）から同一PRのタブを探す。
 * 最初の一致を返す（同一PRが複数グループにあれば先頭のタブ）。無ければ undefined。
 */
export function findSyncedTab(ownedTabs: OwnedTab[], prUrl: string): OwnedTab | undefined {
  return ownedTabs.find((t) => isSamePr(t.prUrl, prUrl));
}

/**
 * 同期所有タブの「現在URL」がまだ対象PRを指しているか。
 * SyncState 保存時の prUrl ではなくタブの実URL（url ?? pendingUrl）で照合するために使う。
 * ユーザーが管理タブを別ページへ手動遷移していれば false → 再利用せず新規タブへフォールバックさせる。
 * URL 未確定（undefined）や PR 以外のURLも false。
 */
export function syncedTabMatchesPr(tabUrl: string | undefined, prUrl: string): boolean {
  return tabUrl !== undefined && isSamePr(tabUrl, prUrl);
}

/**
 * クリック挙動設定と修飾キー押下から、実際に取る操作を決める。
 * Cmd/Ctrl 修飾クリックは常に 'background'（ブラウザ慣習、設定より優先）。
 * 非修飾時は behavior をマップ（newTab → foreground）。
 */
export function resolveClickAction(behavior: ClickBehavior, modified: boolean): ClickAction {
  if (modified) return 'background';
  switch (behavior) {
    case 'reuseSynced':
      return 'reuseSynced';
    case 'background':
      return 'background';
    default:
      return 'foreground';
  }
}
