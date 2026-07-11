import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchOutcome } from '../src/lib/github/fetch';
import type { InboxSnapshot } from '../src/types';
import { defaultSettings } from '../src/lib/settings';

// --- 共有の可変状態とモック関数（vi.mock ファクトリより先に評価される） ---
const mocks = vi.hoisted(() => ({
  fetchInboxQueries: vi.fn(),
  updateBadge: vi.fn(async () => {}),
  syncTabs: vi.fn(async () => {}),
  store: {
    settings: null as ReturnType<typeof defaultSettings> | null,
    snapshot: null as InboxSnapshot | null,
    backoff: undefined as number | undefined,
    dumps: [] as unknown[],
  },
}));

vi.mock('../src/storage', () => ({
  loadSettings: async () => mocks.store.settings,
  loadSnapshot: async () => mocks.store.snapshot,
  saveSnapshot: async (s: InboxSnapshot) => {
    mocks.store.snapshot = s;
  },
  loadBackoffUntil: async () => mocks.store.backoff,
  saveBackoffUntil: async (u: number) => {
    mocks.store.backoff = u;
  },
  saveDebugDump: async (d: unknown[]) => {
    mocks.store.dumps = d;
  },
}));

vi.mock('../src/background/badge', () => ({ updateBadge: mocks.updateBadge }));
vi.mock('../src/background/tabSync', () => ({ syncTabs: mocks.syncTabs }));

vi.mock('../src/lib/github/fetch', async (orig) => {
  const actual = await orig<typeof import('../src/lib/github/fetch')>();
  return { ...actual, fetchInboxQueries: mocks.fetchInboxQueries };
});

vi.mock('../src/lib/github/parseInbox', async (orig) => {
  const actual = await orig<typeof import('../src/lib/github/parseInbox')>();
  return {
    ...actual,
    parseInboxResponse: (body: unknown) => {
      const b = body as { __fail?: boolean; prs?: unknown[] } | null;
      if (b?.__fail) throw new actual.ParseError('boom');
      const prs = (b?.prs ?? []) as never[];
      return { prs, currentPage: 1, totalPages: 1, totalCount: prs.length };
    },
  };
});

// navigator.locks の簡易スタブ（ifAvailable を尊重）
const held = new Set<string>();
vi.stubGlobal('navigator', {
  locks: {
    request: async (
      name: string,
      opts: { ifAvailable?: boolean },
      cb: (lock: unknown) => unknown,
    ) => {
      if (opts?.ifAvailable && held.has(name)) return cb(null);
      held.add(name);
      try {
        return await cb({ name });
      } finally {
        held.delete(name);
      }
    },
  },
});

import { runPoll } from '../src/background/poll';

function ok(prs: { number: number }[] = []): FetchOutcome {
  return { kind: 'ok', body: { prs }, status: 200 } as FetchOutcome;
}

/** filter ごとの FetchOutcome を返すハンドラを設定 */
function setFetch(handler: (filter: string) => FetchOutcome): void {
  mocks.fetchInboxQueries.mockImplementation(async (filter: string) => handler(filter));
}

const pr = (n: number) => ({ number: n }) as { number: number };

beforeEach(() => {
  mocks.fetchInboxQueries.mockReset();
  mocks.updateBadge.mockClear();
  mocks.syncTabs.mockClear();
  held.clear();
  mocks.store.settings = defaultSettings();
  mocks.store.snapshot = null;
  mocks.store.backoff = undefined;
  mocks.store.dumps = [];
});

describe('runPoll', () => {
  it('all sections succeed → ok snapshot with fresh data, tab sync runs', async () => {
    setFetch((filter) => (filter === 'review-requested' ? ok([pr(1), pr(2)]) : ok()));

    const ran = await runPoll();

    expect(ran).toBe(true);
    const snap = mocks.store.snapshot as InboxSnapshot;
    expect(snap.authState).toBe('ok');
    expect(snap.sections).toHaveLength(7);
    expect(snap.sections.find((s) => s.id === 'review-requested')?.prs).toHaveLength(2);
    expect(snap.sectionErrors).toBeUndefined();
    expect(mocks.syncTabs).toHaveBeenCalledTimes(1);
    expect(mocks.updateBadge).toHaveBeenCalledTimes(1);
  });

  it('one section parse-fails → others keep fresh data, failed section falls back to previous', async () => {
    mocks.store.snapshot = {
      fetchedAt: 111,
      authState: 'ok',
      sections: [{ id: 'needs-action', label: 'Needs action', prs: [pr(99)] as never[] }],
    };
    setFetch((filter) => {
      if (filter === 'needs-action')
        return { kind: 'ok', body: { __fail: true }, status: 200 } as FetchOutcome;
      if (filter === 'review-requested') return ok([pr(1)]);
      return ok();
    });

    const ran = await runPoll();

    expect(ran).toBe(true);
    const snap = mocks.store.snapshot as InboxSnapshot;
    expect(snap.authState).toBe('ok');
    // 成功セクションは新データ
    expect(snap.sections.find((s) => s.id === 'review-requested')?.prs).toHaveLength(1);
    // 失敗セクションは前回データで補完
    expect(snap.sections.find((s) => s.id === 'needs-action')?.prs).toEqual([pr(99)]);
    expect(snap.sectionErrors).toEqual([
      { id: 'needs-action', detail: expect.stringContaining('parse failed (needs-action)') },
    ]);
    expect(mocks.syncTabs).toHaveBeenCalledTimes(1);
  });

  it('one section http_errors → isolated, others fresh, no previous → empty fallback', async () => {
    setFetch((filter) => {
      if (filter === 'your-drafts')
        return { kind: 'http_error', status: 500, detail: 'boom' } as FetchOutcome;
      if (filter === 'review-requested') return ok([pr(1)]);
      return ok();
    });

    await runPoll();

    const snap = mocks.store.snapshot as InboxSnapshot;
    expect(snap.authState).toBe('ok');
    expect(snap.sections.find((s) => s.id === 'review-requested')?.prs).toHaveLength(1);
    expect(snap.sections.find((s) => s.id === 'your-drafts')?.prs).toEqual([]);
    expect(snap.sectionErrors?.[0]).toMatchObject({ id: 'your-drafts' });
  });

  it('all sections fail → authState error, previous freshness kept', async () => {
    mocks.store.snapshot = { fetchedAt: 111, authState: 'ok', sections: [] };
    setFetch(() => ({ kind: 'http_error', status: 500, detail: 'boom' }) as FetchOutcome);

    await runPoll();

    const snap = mocks.store.snapshot as InboxSnapshot;
    expect(snap.authState).toBe('error');
    expect(snap.fetchedAt).toBe(111);
    expect(snap.sectionErrors).toHaveLength(7);
    // authState !== 'ok' なので tabSync は呼ぶが（内部で早期return）、ここでは呼び出しのみ確認
    expect(mocks.syncTabs).toHaveBeenCalledTimes(1);
  });

  it('logged_out → whole run aborts, cache preserved, no tab sync', async () => {
    mocks.store.snapshot = {
      fetchedAt: 222,
      authState: 'ok',
      sections: [{ id: 'review-requested', label: 'x', prs: [pr(5)] as never[] }],
    };
    setFetch(() => ({ kind: 'logged_out' }) as FetchOutcome);

    await runPoll();

    const snap = mocks.store.snapshot as InboxSnapshot;
    expect(snap.authState).toBe('logged_out');
    expect(snap.sections).toHaveLength(1);
    expect(snap.fetchedAt).toBe(222);
    expect(mocks.syncTabs).not.toHaveBeenCalled();
  });

  it('rate_limited → sets backoffUntil and aborts the whole run', async () => {
    const before = Date.now();
    setFetch(() => ({ kind: 'rate_limited', retryAfterSeconds: 60 }) as FetchOutcome);

    await runPoll();

    expect(mocks.store.backoff).toBeGreaterThanOrEqual(before + 60_000);
    expect((mocks.store.snapshot as InboxSnapshot).authState).toBe('rate_limited');
    expect(mocks.syncTabs).not.toHaveBeenCalled();
  });

  it('respects an active backoff window → does not fetch', async () => {
    mocks.store.backoff = Date.now() + 100_000;
    setFetch(() => ok());

    const ran = await runPoll();

    expect(ran).toBe(true); // ロックは取得したが早期return
    expect(mocks.fetchInboxQueries).not.toHaveBeenCalled();
    expect(mocks.syncTabs).not.toHaveBeenCalled();
  });

  it('serializes overlapping runs → second call is skipped, fetch runs once', async () => {
    setFetch(() => ok());

    const p1 = runPoll();
    const p2 = runPoll();
    const [r1, r2] = await Promise.all([p1, p2]);

    expect([r1, r2].sort()).toEqual([false, true]);
    // 7 既知セクション × 1ページ = 1回分の poll しか走らない
    expect(mocks.fetchInboxQueries).toHaveBeenCalledTimes(7);
  });
});
