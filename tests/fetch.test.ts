import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildInboxQueriesUrl, fetchInboxQueries } from '../src/lib/github/fetch';

/**
 * 最小限のResponseスタブ。fetch.tsが参照するプロパティ（status/ok/redirected/url/
 * headers/text/json）だけを備える。実Responseは`redirected`/`url`をコンストラクタで
 * 設定できないため、プレーンオブジェクトをResponseにキャストする。
 */
function makeRes(init: {
  status?: number;
  ok?: boolean;
  redirected?: boolean;
  url?: string;
  headers?: Record<string, string>;
  text?: string;
  json?: unknown;
}): Response {
  const status = init.status ?? 200;
  const text = init.text ?? (init.json !== undefined ? JSON.stringify(init.json) : '');
  return {
    status,
    ok: init.ok ?? (status >= 200 && status < 300),
    redirected: init.redirected ?? false,
    url: init.url ?? 'https://github.com/pulls/inbox/queries',
    headers: new Headers(init.headers ?? {}),
    text: async () => text,
    json: async () => (init.json !== undefined ? init.json : JSON.parse(text)),
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('buildInboxQueriesUrl', () => {
  it('builds a URL with filter and max_pr_age, adding page only when > 1', () => {
    expect(buildInboxQueriesUrl('review-requested', '2w')).toBe(
      'https://github.com/pulls/inbox/queries?filter=review-requested&max_pr_age=2w',
    );
    expect(buildInboxQueriesUrl('review-requested', '2w', 1)).not.toContain('page');
    expect(buildInboxQueriesUrl('review-requested', '2w', 2)).toContain('page=2');
  });
});

// Issue #18: fetch timeout / hang protection.
describe('fetchInboxQueries — timeout (#18)', () => {
  it('returns ok on a normal JSON response', async () => {
    const body = { payload: { hello: 'world' } };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => makeRes({ status: 200, json: body })),
    );
    const outcome = await fetchInboxQueries('review-requested', '2w');
    expect(outcome).toEqual({ kind: 'ok', body, status: 200 });
  });

  it('maps a rejected fetch (network error) to http_error status 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const outcome = await fetchInboxQueries('review-requested', '2w');
    expect(outcome.kind).toBe('http_error');
    if (outcome.kind === 'http_error') {
      expect(outcome.status).toBe(0);
      expect(outcome.detail).toContain('network error');
    }
  });

  it('aborts a hanging request and returns http_error status 0 within the timeout', async () => {
    // AbortSignal.timeout()は実タイマー依存でvitestのfake timersを無視するため、
    // 制御可能なsignalを返すようにstubし、タイムアウト発火をシミュレートする。
    const controller = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);

    // 永遠にresolveしないが、abort時にsignal.reason（TimeoutError）でrejectするfetch。
    const fetchMock = vi.fn(
      (_url: string, opts?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => {
            reject((opts.signal as AbortSignal).reason);
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchInboxQueries('review-requested', '2w');
    // 20秒経過相当: AbortSignal.timeoutが投げるのと同じTimeoutErrorでabortする。
    controller.abort(new DOMException('The operation timed out.', 'TimeoutError'));

    const outcome = await promise;
    expect(outcome).toEqual({ kind: 'http_error', status: 0, detail: 'timeout after 20s' });
    expect(timeoutSpy).toHaveBeenCalledWith(20_000);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});

// Issue #22: 404 must not blindly mean logged out.
describe('fetchInboxQueries — 404 handling (#22)', () => {
  it('treats a 404 with the auth-error JSON as logged out (curly apostrophe)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeRes({ status: 404, ok: false, text: '{"error":"Couldn’t authenticate you"}' }),
      ),
    );
    const outcome = await fetchInboxQueries('review-requested', '2w');
    expect(outcome).toEqual({ kind: 'logged_out' });
  });

  it('treats a 404 with a straight-apostrophe auth error as logged out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeRes({ status: 404, ok: false, text: '{"error":"Couldn\'t authenticate you"}' }),
      ),
    );
    const outcome = await fetchInboxQueries('review-requested', '2w');
    expect(outcome).toEqual({ kind: 'logged_out' });
  });

  it('treats a bare 404 (endpoint gone) as http_error, not logged out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => makeRes({ status: 404, ok: false, text: 'Not Found' })),
    );
    const outcome = await fetchInboxQueries('review-requested', '2w');
    expect(outcome).toEqual({ kind: 'http_error', status: 404, detail: 'Not Found' });
  });

  it('treats a redirect to /login as logged out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeRes({ status: 200, redirected: true, url: 'https://github.com/login?return_to=x' }),
      ),
    );
    const outcome = await fetchInboxQueries('review-requested', '2w');
    expect(outcome).toEqual({ kind: 'logged_out' });
  });
});

// Issue #24: Retry-After supports delta-seconds and HTTP-date.
describe('fetchInboxQueries — Retry-After (#24)', () => {
  async function rateLimited(retryAfter: string): Promise<number> {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeRes({ status: 429, ok: false, headers: { 'retry-after': retryAfter } }),
      ),
    );
    const outcome = await fetchInboxQueries('review-requested', '2w');
    expect(outcome.kind).toBe('rate_limited');
    return outcome.kind === 'rate_limited' ? outcome.retryAfterSeconds : -1;
  }

  it('parses delta-seconds', async () => {
    expect(await rateLimited('120')).toBe(120);
  });

  it('parses an HTTP-date into a delta from now', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T07:26:00Z'));
    expect(await rateLimited('Wed, 21 Oct 2026 07:28:00 GMT')).toBe(120);
  });

  it('falls back to 300 for an unparseable value', async () => {
    expect(await rateLimited('soon')).toBe(300);
    expect(await rateLimited('')).toBe(300);
  });

  it('falls back to 300 for a past HTTP-date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T07:30:00Z'));
    expect(await rateLimited('Wed, 21 Oct 2026 07:28:00 GMT')).toBe(300);
  });

  it('clamps an excessive delta-seconds to the 3600 ceiling', async () => {
    expect(await rateLimited('100000')).toBe(3600);
  });
});
