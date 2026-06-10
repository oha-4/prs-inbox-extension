export type FetchOutcome =
  | { kind: 'ok'; body: unknown; status: number }
  | { kind: 'logged_out' }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'http_error'; status: number; detail: string };

export function buildInboxQueriesUrl(filter: string, maxPrAge: string, page?: number): string {
  const params = new URLSearchParams({ filter, max_pr_age: maxPrAge });
  if (page !== undefined && page > 1) params.set('page', String(page));
  return `https://github.com/pulls/inbox/queries?${params.toString()}`;
}

/**
 * Cookie認証（ブラウザのgithub.comセッション）で非公開inbox APIを叩く。
 * 未ログイン時の実測挙動: JSON Accept → 404 {"error":"Couldn’t authenticate you"}、
 * HTML Accept → /login へ302。
 */
export async function fetchInboxQueries(
  filter: string,
  maxPrAge: string,
  page?: number,
): Promise<FetchOutcome> {
  const url = buildInboxQueriesUrl(filter, maxPrAge, page);
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
  } catch (e) {
    return { kind: 'http_error', status: 0, detail: `network error: ${String(e)}` };
  }

  if (res.redirected && res.url.includes('/login')) return { kind: 'logged_out' };
  if (res.status === 404) return { kind: 'logged_out' };
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after'));
    return {
      kind: 'rate_limited',
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 300,
    };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { kind: 'http_error', status: res.status, detail: text.slice(0, 200) };
  }
  try {
    return { kind: 'ok', body: await res.json(), status: res.status };
  } catch {
    return { kind: 'http_error', status: res.status, detail: 'response was not JSON' };
  }
}
