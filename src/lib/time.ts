// 月=30日・年=365日で近似する（暦月・閏年は無視）。相対時刻の粗い表示専用。
const UNITS: [name: string, seconds: number][] = [
  ['y', 365 * 24 * 3600],
  ['mo', 30 * 24 * 3600],
  ['d', 24 * 3600],
  ['h', 3600],
  ['m', 60],
];

/**
 * 相対時刻をデータとして返す純関数（chrome.* / t() には依存しない）。
 * - 不正な日時 → `null`（表示側でセパレータごと非表示にする）
 * - 60秒未満 → `'now'`（表示側で `t('timeNow')` に置換する）
 * - それ以外 → `"3h"` のような数値+単位（`localizeRelative` でローカライズする）
 *
 * 出力形式は `localizeRelative`（src/lib/i18n.ts）とだけ結合している。
 */
export function formatRelative(iso: string, now: number = Date.now()): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diff = Math.max(0, Math.floor((now - t) / 1000));
  for (const [name, seconds] of UNITS) {
    if (diff >= seconds) return `${Math.floor(diff / seconds)}${name}`;
  }
  return 'now';
}
