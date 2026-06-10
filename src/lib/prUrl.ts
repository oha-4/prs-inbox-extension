const PR_URL_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#]|$)/;

/**
 * PRページのURLを 'owner/repo#number' の正規化キーにする。
 * /files や /commits、アンカー付きでも同じPRなら同一キー。PR以外のURLは null。
 */
export function prUrlKey(url: string): string | null {
  const m = PR_URL_RE.exec(url);
  if (!m) return null;
  return `${m[1]!.toLowerCase()}/${m[2]!.toLowerCase()}#${m[3]!}`;
}

/** タブのURLがまだ同じPR上にあるか（タブ所有権の判定に使用） */
export function isSamePr(tabUrl: string, prUrl: string): boolean {
  const a = prUrlKey(tabUrl);
  const b = prUrlKey(prUrl);
  return a !== null && a === b;
}
