import type { PullRequest, SortCriterion, SortKey } from '../types';

function dateValue(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

function compareBy(a: PullRequest, b: PullRequest, key: SortKey): number {
  switch (key) {
    case 'repo':
      return a.repoNameWithOwner.localeCompare(b.repoNameWithOwner);
    case 'created':
      return dateValue(a.createdAt) - dateValue(b.createdAt); // asc = 古い順
    case 'updated':
      return dateValue(a.updatedAt) - dateValue(b.updatedAt);
  }
}

/** 多段ソートの比較関数。先頭の条件が最優先。最後は番号で安定化 */
export function comparePrs(a: PullRequest, b: PullRequest, criteria: SortCriterion[]): number {
  for (const c of criteria) {
    const v = compareBy(a, b, c.key);
    if (v !== 0) return c.dir === 'asc' ? v : -v;
  }
  return a.number - b.number;
}

export function sortPrs(prs: PullRequest[], criteria: SortCriterion[]): PullRequest[] {
  return [...prs].sort((a, b) => comparePrs(a, b, criteria));
}
