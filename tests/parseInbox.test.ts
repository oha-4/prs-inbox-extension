import { describe, expect, it } from 'vitest';
import { ParseError, parseInboxResponse } from '../src/lib/github/parseInbox';
import fixture from './fixtures/inbox-queries.json';

describe('parseInboxResponse', () => {
  it('parses the real fixture payload', () => {
    const page = parseInboxResponse(fixture);
    expect(page.prs).toHaveLength(3);
    expect(page.totalCount).toBe(3);
    expect(page.totalPages).toBe(1);

    const first = page.prs[0]!;
    expect(first).toMatchObject({
      id: '3838188628',
      number: 152,
      url: 'https://github.com/acme/widgets/pull/152',
      repoNameWithOwner: 'acme/widgets',
      authorLogin: 'alice',
      state: 'OPEN',
      isDraft: false,
      commentCount: 15,
      isReadByCurrentUser: false,
    });

    const draft = page.prs[1]!;
    expect(draft.isDraft).toBe(true);
  });

  it('falls back to scanning payload when the route key is renamed', () => {
    const renamed = {
      payload: {
        someFutureRouteName: (fixture as Record<string, any>).payload.pullsInboxSurfaceContentRoute,
      },
    };
    const page = parseInboxResponse(renamed);
    expect(page.prs).toHaveLength(3);
  });

  it('throws ParseError when payload is missing', () => {
    expect(() => parseInboxResponse({})).toThrow(ParseError);
    expect(() => parseInboxResponse(null)).toThrow(ParseError);
    expect(() => parseInboxResponse({ payload: {} })).toThrow(ParseError);
  });

  it('throws ParseError when the route reports an error', () => {
    expect(() =>
      parseInboxResponse({
        payload: { pullsInboxSurfaceContentRoute: { results: [], error: 'boom' } },
      }),
    ).toThrow(ParseError);
  });

  it('throws ParseError when results exist but none are parseable', () => {
    expect(() =>
      parseInboxResponse({
        payload: { pullsInboxSurfaceContentRoute: { results: [{ totally: 'different' }] } },
      }),
    ).toThrow(ParseError);
  });

  it('skips malformed entries but keeps valid ones', () => {
    const payload = {
      payload: {
        pullsInboxSurfaceContentRoute: {
          results: [
            { totally: 'different' },
            (fixture as Record<string, any>).payload.pullsInboxSurfaceContentRoute.results[0],
          ],
          pageInfo: { currentPage: 1, totalPages: 1, totalCount: 2 },
          error: null,
        },
      },
    };
    const page = parseInboxResponse(payload);
    expect(page.prs).toHaveLength(1);
  });

  it('handles empty results (empty inbox)', () => {
    const page = parseInboxResponse({
      payload: {
        pullsInboxSurfaceContentRoute: {
          results: [],
          pageInfo: { currentPage: 1, totalPages: 1, totalCount: 0 },
          error: null,
        },
      },
    });
    expect(page.prs).toHaveLength(0);
    expect(page.totalCount).toBe(0);
  });
});
