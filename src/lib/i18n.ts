/**
 * chrome.i18n の薄いラッパー。
 * メッセージ未定義時はキーをそのまま返す（翻訳漏れに気付きやすくする）。
 */
export function t(key: string, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(key, substitutions) || key;
}
