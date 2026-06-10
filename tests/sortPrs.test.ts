import { describe, expect, it } from 'vitest';
import { sortPrs } from '../src/lib/sortPrs';
import type { PullRequest, SortCriterion } from '../src/types';

function pr(over: Partial<PullRequest>): PullRequest {
  return {
    id: over.id ?? Math.random().toString(),
    number: over.number ?? 1,
    title: 't',
    url: 'https://github.com/x/y/pull/1',
    repoNameWithOwner: over.repoNameWithOwner ?? 'acme/widgets',
    authorLogin: over.authorLogin ?? 'a',
    state: 'OPEN',
    isDraft: false,
    commentCount: 0,
    isReadByCurrentUser: true,
    createdAt: over.createdAt ?? '2026-01-01T00:00:00Z',
    updatedAt: over.updatedAt ?? '2026-01-01T00:00:00Z',
    ...over,
  };
}

const ids = (prs: PullRequest[]): string[] => prs.map((p) => p.id);

describe('sortPrs', () => {
  it('repo asc orders repositories A→Z', () => {
    const a = pr({ id: 'a', repoNameWithOwner: 'zeta/x' });
    const b = pr({ id: 'b', repoNameWithOwner: 'alpha/x' });
    const out = sortPrs([a, b], [{ key: 'repo', dir: 'asc' }]);
    expect(ids(out)).toEqual(['b', 'a']);
  });

  it('created asc puts the oldest first', () => {
    const old = pr({ id: 'old', createdAt: '2026-01-01T00:00:00Z' });
    const recent = pr({ id: 'new', createdAt: '2026-06-01T00:00:00Z' });
    expect(ids(sortPrs([recent, old], [{ key: 'created', dir: 'asc' }]))).toEqual(['old', 'new']);
    expect(ids(sortPrs([old, recent], [{ key: 'created', dir: 'desc' }]))).toEqual(['new', 'old']);
  });

  it('updated desc puts the most recently updated first', () => {
    const stale = pr({ id: 'stale', updatedAt: '2026-01-01T00:00:00Z' });
    const fresh = pr({ id: 'fresh', updatedAt: '2026-06-10T00:00:00Z' });
    expect(ids(sortPrs([stale, fresh], [{ key: 'updated', dir: 'desc' }]))).toEqual([
      'fresh',
      'stale',
    ]);
  });

  it('applies a two-level sort: repo then created-oldest', () => {
    const criteria: SortCriterion[] = [
      { key: 'repo', dir: 'asc' },
      { key: 'created', dir: 'asc' },
    ];
    const a = pr({ id: 'a', repoNameWithOwner: 'acme/a', createdAt: '2026-03-01T00:00:00Z' });
    const b = pr({ id: 'b', repoNameWithOwner: 'acme/a', createdAt: '2026-01-01T00:00:00Z' });
    const c = pr({ id: 'c', repoNameWithOwner: 'beta/b', createdAt: '2026-02-01T00:00:00Z' });
    expect(ids(sortPrs([a, c, b], criteria))).toEqual(['b', 'a', 'c']);
  });

  it('falls back to PR number for full ties', () => {
    const a = pr({ id: 'a', number: 30 });
    const b = pr({ id: 'b', number: 10 });
    expect(ids(sortPrs([a, b], []))).toEqual(['b', 'a']);
  });

  it('does not mutate the input array', () => {
    const arr = [pr({ id: 'a', number: 2 }), pr({ id: 'b', number: 1 })];
    const snapshot = ids(arr);
    sortPrs(arr, [{ key: 'created', dir: 'asc' }]);
    expect(ids(arr)).toEqual(snapshot);
  });
});
