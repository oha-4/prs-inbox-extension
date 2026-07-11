import type { OwnedTab } from '../types';
import { prUrlKey } from './prUrl';

/**
 * keepEmptyGroups 用プレースホルダタブ。
 * 空になったタブグループに GitHub Pages の Inbox Zero ページを1枚置いて
 * グループの消滅（＝位置の喪失）を防ぐ。安定グループ ID（SyncGroup.id）は
 * URL フラグメントの gid で渡し、表示用のグループ名は group で併記する。
 * いずれも URL フラグメントなので、サーバー（Pages/CDN）には一切送信されない。
 * chrome-extension:// ページではなくリモート URL なのは意図的:
 * 拡張のリロード/更新は内部ページのタブを強制クローズし、グループが道連れに消えるため。
 */
const PLACEHOLDER_ORIGIN = 'https://oha-4.github.io';
const PLACEHOLDER_PATH = '/prs-inbox-extension/inbox-zero/';
const PLACEHOLDER_ID_PREFIX = 'placeholder:';

export const PLACEHOLDER_URL_BASE = `${PLACEHOLDER_ORIGIN}${PLACEHOLDER_PATH}`;

export function makePlaceholderUrl(groupId: string, groupName: string): string {
  return `${PLACEHOLDER_URL_BASE}#gid=${encodeURIComponent(groupId)}&group=${encodeURIComponent(groupName)}`;
}

/** GitHub の PR node id と衝突しない疑似 prId（'placeholder:<groupId>'） */
export function placeholderPrId(groupId: string): string {
  return `${PLACEHOLDER_ID_PREFIX}${groupId}`;
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
  // gid（安定グループ ID）を識別に使う。gid の無い旧形式 URL（#group=... のみ）は
  // 意図的にプレースホルダ扱いせず（＝外部タブ扱いで）null を返す。
  const gid = new URLSearchParams(u.hash.slice(1)).get('gid');
  return gid ? placeholderPrId(gid) : null;
}

/** タブ同期でのマッチングキー: PR なら prUrlKey、プレースホルダなら placeholderKey */
export function tabKey(url: string): string | null {
  return prUrlKey(url) ?? placeholderKey(url);
}

/**
 * 孤児プレースホルダタブの ID を抽出する（純粋）。
 *
 * 対象は所有プレースホルダのうち、所属 sync group が設定上もう存在しない
 * （＝グループが削除された）もの。削除グループの chrome グループは
 * `resolveGroups` が解決しないため、そのプレースホルダは所有検証で validOwned
 * から落ちるだけで close されず孤児として残る。復活先のグループが無い以上
 * 掃除して閉じてよい。
 *
 * 「プレースホルダのみ」が対象。released された PR タブやユーザータブは
 * （たとえ削除グループに属していても）normal モードの「ユーザーのタブは尊重する」
 * 原則に従い一切閉じない。呼び出し側は、生存かつ URL がプレースホルダのまま
 * （＝ユーザーがナビゲートで別ページにしていない）owned タブのみを渡すこと。
 *
 * @param ownedTabs 判定対象の所有タブ
 * @param knownGroupIds 設定に現存する全 SyncGroup.id（active/inactive 問わず）
 */
export function orphanedPlaceholderTabIds(
  ownedTabs: OwnedTab[],
  knownGroupIds: Set<string>,
): number[] {
  return ownedTabs
    .filter((ot) => isPlaceholderId(ot.prId) && !knownGroupIds.has(ot.groupId))
    .map((ot) => ot.tabId);
}
