import { prUrlKey } from './prUrl';

/**
 * keepEmptyGroups 用プレースホルダタブ。
 * 空になったタブグループに GitHub Pages の Inbox Zero ページを1枚置いて
 * グループの消滅（＝位置の喪失）を防ぐ。グループ名は URL フラグメントで
 * 渡すため、サーバー（Pages/CDN）には一切送信されない。
 * chrome-extension:// ページではなくリモート URL なのは意図的:
 * 拡張のリロード/更新は内部ページのタブを強制クローズし、グループが道連れに消えるため。
 */
const PLACEHOLDER_ORIGIN = 'https://oha-4.github.io';
const PLACEHOLDER_PATH = '/prs-inbox-extension/inbox-zero/';
const PLACEHOLDER_ID_PREFIX = 'placeholder:';

export const PLACEHOLDER_URL_BASE = `${PLACEHOLDER_ORIGIN}${PLACEHOLDER_PATH}`;

export function makePlaceholderUrl(groupName: string): string {
  return `${PLACEHOLDER_URL_BASE}#group=${encodeURIComponent(groupName)}`;
}

/** GitHub の PR node id と衝突しない疑似 prId（'placeholder:<groupName>'） */
export function placeholderPrId(groupName: string): string {
  return `${PLACEHOLDER_ID_PREFIX}${groupName}`;
}

export function isPlaceholderId(prId: string): boolean {
  return prId.startsWith(PLACEHOLDER_ID_PREFIX);
}

/** プレースホルダ URL を疑似 prId に正規化。それ以外の URL は null */
export function placeholderKey(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.origin !== PLACEHOLDER_ORIGIN) return null;
  const path = u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/`;
  if (path !== PLACEHOLDER_PATH) return null;
  const group = new URLSearchParams(u.hash.slice(1)).get('group');
  return group ? placeholderPrId(group) : null;
}

/** タブ同期でのマッチングキー: PR なら prUrlKey、プレースホルダなら placeholderKey */
export function tabKey(url: string): string | null {
  return prUrlKey(url) ?? placeholderKey(url);
}
