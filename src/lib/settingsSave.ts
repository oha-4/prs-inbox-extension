import type { Settings } from '../types';

/**
 * 設定保存（storage.sync）の副作用を持たない補助ロジック。
 * chrome.* に触れないので vitest で単体テストできる。
 */

/** トグル/セレクト連打を1回の書き込みにまとめる trailing debounce 幅（ms）。
 *  popup が閉じる直前の取りこぼしを避けるため保守的に短くしてある。 */
export const SAVE_DEBOUNCE_MS = 500;

/** storage.sync の 1 アイテム上限（QUOTA_BYTES_PER_ITEM ≈ 8KB）。 */
export const QUOTA_BYTES_PER_ITEM = 8192;

/** この閾値を超えたら保存前に「大きすぎるかも」と警告する（上限より少し手前）。 */
export const QUOTA_WARN_BYTES = 7168;

/** storage.sync に書き込む JSON のおおよそのバイト数。 */
export function estimateSettingsBytes(settings: Settings): number {
  return new TextEncoder().encode(JSON.stringify(settings)).length;
}

/** 上限手前まで肥大しているか（保存前の事前警告用）。 */
export function isNearQuota(settings: Settings): boolean {
  return estimateSettingsBytes(settings) >= QUOTA_WARN_BYTES;
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err ?? '');
}

/**
 * 保存失敗を UI 文言キーに分類する。
 * chrome.storage.sync のクォータ系エラー（"QUOTA_BYTES_PER_ITEM quota exceeded"、
 * "MAX_WRITE_OPERATIONS_PER_MINUTE quota exceeded" 等）は専用メッセージへ。
 */
export function classifySaveError(err: unknown): 'saveErrorQuota' | 'saveErrorGeneric' {
  const msg = errorText(err).toLowerCase();
  if (msg.includes('quota') || msg.includes('max_write') || msg.includes('too large')) {
    return 'saveErrorQuota';
  }
  return 'saveErrorGeneric';
}
