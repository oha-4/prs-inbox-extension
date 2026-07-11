/**
 * chrome.i18n の薄いラッパー。
 * メッセージ未定義時はキーをそのまま返す（翻訳漏れに気付きやすくする）。
 */
export function t(key: string, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

const REL_UNIT_KEY: Record<string, string> = {
  m: 'relMin',
  h: 'relHour',
  d: 'relDay',
  mo: 'relMonth',
  y: 'relYear',
};

/**
 * `formatRelative`（src/lib/time.ts）の出力を表示文字列にローカライズする唯一の場所。
 * time.ts の出力形式と表示側の結合はここに集約する。
 * - `null`（不正日時）→ `null`（呼び出し側でセパレータごと非表示にする）
 * - `'now'`（60秒未満）→ `t('timeNow')`
 * - `"3h"` のような数値+単位 → `t('relHour', '3')` など
 * - 想定外の形式 → `null`（生値を素通しさせない）
 */
export function localizeRelative(rel: string | null): string | null {
  if (rel === null) return null;
  if (rel === 'now') return t('timeNow');
  const m = /^(\d+)(mo|m|h|d|y)$/.exec(rel);
  if (!m) return null;
  const key = REL_UNIT_KEY[m[2]!];
  return key ? t(key, m[1]!) : null;
}
