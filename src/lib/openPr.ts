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

/** クリック時の修飾キー / マウスボタン。副作用側が MouseEvent から詰める */
export interface ClickModifiers {
  /** metaKey（macOS の Cmd） */
  meta: boolean;
  /** ctrlKey */
  ctrl: boolean;
  /** shiftKey */
  shift: boolean;
  /** 中クリック（マウス中ボタン / button === 1） */
  middle: boolean;
}

/**
 * クリック挙動設定と修飾キー / マウスボタンから、実際に取る操作を決める。
 * - Shift: `null` を返す＝**インターセプトしない**。呼び出し側は preventDefault せず、
 *   アンカーの href によるブラウザ標準の「新規ウィンドウで開く」に委ねる。
 * - 中クリック / Cmd/Ctrl+クリック: 常に 'background'（ブラウザ慣習、設定より優先）。
 *   ネイティブと見た目は同じでもコード経路を統一し、将来の挙動変更に追従させる。
 * - 非修飾: behavior をマップ（newTab → foreground）。
 */
export function resolveClickAction(
  behavior: ClickBehavior,
  mods: ClickModifiers,
): ClickAction | null {
  if (mods.shift) return null;
  if (mods.middle || mods.meta || mods.ctrl) return 'background';
  switch (behavior) {
    case 'reuseSynced':
      return 'reuseSynced';
    case 'background':
      return 'background';
    default:
      return 'foreground';
  }
}
