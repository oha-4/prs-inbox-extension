import type { Settings } from '../types';
import { mergeSettings } from './settings';

/** 設定変更で再実行すべきバックグラウンド処理のフラグ */
export interface SettingsChangeTargets {
  /** poll アラームの再作成（間隔変更時のみ） */
  alarm: boolean;
  /** ツールバーバッジの再計算 */
  badge: boolean;
  /** タブグループ同期の再実行（全タブ列挙・検証・並べ替え） */
  tabSync: boolean;
}

type Target = 'alarm' | 'badge' | 'tabSync';

/**
 * 現在の Settings 全キーの分類表。
 * ここに載っていないキー（＝将来追加され載せ忘れたキー）は
 * settingsChangeTargets のフォールバックで安全側（tabSync）扱いになる。
 */
const KEY_TARGETS: Record<keyof Settings, Target[]> = {
  // poll 間隔だけがアラーム周期に効く
  pollIntervalMinutes: ['alarm'],
  // 次回 poll のリクエストパラメータ（max_pr_age）にのみ効く。
  // 既存キャッシュのバッジ/タブには影響しないので即時再同期は不要。
  maxPrAge: [],
  autoCloseRemoved: ['tabSync'],
  badgeEnabled: ['badge'],
  badgeIncludeTeamReview: ['badge'],
  sortCriteria: ['tabSync'],
  forceAlignOnRefresh: ['tabSync'],
  keepEmptyGroups: ['tabSync'],
  syncGroups: ['tabSync'],
  customSections: ['tabSync'],
  // popup 表示のみ（取得・バッジ・タブ同期に影響しない）
  hiddenSections: [],
  inboxOrder: [],
  // フィルタは popup・バッジ・タブ同期すべてに中央適用されるため両方に効く
  allowlist: ['badge', 'tabSync'],
  blocklist: ['badge', 'tabSync'],
  // デバッグダンプ用のトグル。表示・取得挙動のみで再同期不要
  debugMode: [],
};

/**
 * 設定の old/new を比較し、実行すべきバックグラウンド処理を判定する pure 関数。
 * 変更頻度が低いので値比較は mergeSettings 正規化後の JSON.stringify で十分。
 * 分類表に無いキーが変わった場合は安全側で tabSync を立てる。
 */
export function settingsChangeTargets(oldVal: unknown, newVal: unknown): SettingsChangeTargets {
  const oldS = mergeSettings(oldVal);
  const newS = mergeSettings(newVal);
  const result: SettingsChangeTargets = { alarm: false, badge: false, tabSync: false };

  const keys = new Set<keyof Settings>([
    ...(Object.keys(oldS) as (keyof Settings)[]),
    ...(Object.keys(newS) as (keyof Settings)[]),
  ]);

  for (const key of keys) {
    if (JSON.stringify(oldS[key]) === JSON.stringify(newS[key])) continue;
    const targets = KEY_TARGETS[key];
    if (!targets) {
      // 未分類キー（将来追加）: 安全側で全同期を促す
      result.tabSync = true;
      continue;
    }
    for (const t of targets) result[t] = true;
  }

  return result;
}
