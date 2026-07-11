export type FetchOutcome =
  | { kind: 'ok'; body: unknown; status: number }
  | { kind: 'logged_out' }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'http_error'; status: number; detail: string };

/** 1リクエストのハングでpollのセクションループが停止しないよう全fetchに課すタイムアウト。 */
const FETCH_TIMEOUT_MS = 20_000;

/** Retry-Afterの上限クランプ（秒）。異常に長い待機で更新が事実上止まるのを防ぐ。 */
const RETRY_AFTER_MAX_SECONDS = 3600;

/** Retry-After解析不能時のフォールバック（秒）。 */
const RETRY_AFTER_FALLBACK_SECONDS = 300;

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
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    // AbortSignal.timeout()はTimeoutError（DOMException）でrejectする。
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      return { kind: 'http_error', status: 0, detail: `timeout after ${FETCH_TIMEOUT_MS / 1000}s` };
    }
    return { kind: 'http_error', status: 0, detail: `network error: ${String(e)}` };
  }

  if (res.redirected && res.url.includes('/login')) return { kind: 'logged_out' };
  if (res.status === 404) {
    // private APIパスの消滅による素の404を「ログアウト」と誤判定しない。
    // 認証エラーはbodyに "Couldn't authenticate you" を含む（' と ’ の両方に耐える）。
    const text = await res.text().catch(() => '');
    if (/couldn.t authenticate you/i.test(text)) return { kind: 'logged_out' };
    return { kind: 'http_error', status: 404, detail: text.slice(0, 200) };
  }
  if (res.status === 429) {
    const header = res.headers.get('retry-after') ?? '';
    // delta-seconds（例: "120"）を優先。非数値ならHTTP-date形式を試す。
    let seconds = Number(header);
    if (!Number.isFinite(seconds)) {
      const dateMs = Date.parse(header);
      if (!Number.isNaN(dateMs)) seconds = Math.ceil((dateMs - Date.now()) / 1000);
    }
    const valid = Number.isFinite(seconds) && seconds > 0;
    return {
      kind: 'rate_limited',
      retryAfterSeconds: valid
        ? Math.min(seconds, RETRY_AFTER_MAX_SECONDS)
        : RETRY_AFTER_FALLBACK_SECONDS,
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
