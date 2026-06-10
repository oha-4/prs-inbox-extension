import { describe, expect, it } from 'vitest';
import { filterSections, matchesPattern, passesFilters } from '../src/lib/filters';
import type { InboxSection, PullRequest } from '../src/types';

function pr(repo: string): PullRequest {
  return {
    id: repo,
    number: 1,
    title: 't',
    url: `https://github.com/${repo}/pull/1`,
    repoNameWithOwner: repo,
    authorLogin: 'a',
    state: 'OPEN',
    isDraft: false,
    commentCount: 0,
    isReadByCurrentUser: true,
    createdAt: '',
    updatedAt: '',
  };
}

describe('matchesPattern', () => {
  it('matches owner pattern against any repo of that owner', () => {
    expect(matchesPattern('acme/widgets', 'acme')).toBe(true);
    expect(matchesPattern('acme-corp/widgets', 'acme')).toBe(false);
    expect(matchesPattern('other/widgets', 'acme')).toBe(false);
  });

  it('matches owner/repo pattern exactly', () => {
    expect(matchesPattern('acme/widgets', 'acme/widgets')).toBe(true);
    expect(matchesPattern('acme/widgets-sdk', 'acme/widgets')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(matchesPattern('Acme/Widgets', 'acme/widgets')).toBe(true);
    expect(matchesPattern('acme/widgets', 'ACME')).toBe(true);
  });

  it('ignores empty patterns', () => {
    expect(matchesPattern('acme/widgets', '')).toBe(false);
    expect(matchesPattern('acme/widgets', '  ')).toBe(false);
  });
});

describe('passesFilters', () => {
  it('allows everything when both lists are empty', () => {
    expect(passesFilters('acme/widgets', [], [])).toBe(true);
  });

  it('blocklist wins over allowlist', () => {
    expect(passesFilters('acme/widgets', ['acme'], ['acme/widgets'])).toBe(false);
  });

  it('non-empty allowlist excludes unlisted repos', () => {
    expect(passesFilters('acme/widgets', ['other'], [])).toBe(false);
    expect(passesFilters('other/repo', ['other'], [])).toBe(true);
  });
});

describe('filterSections', () => {
  it('filters PRs inside each section', () => {
    const sections: InboxSection[] = [
      { id: 'review-requested', label: 'Needs your review', prs: [pr('acme/a'), pr('evil/b')] },
    ];
    const out = filterSections(sections, [], ['evil']);
    expect(out[0]!.prs.map((p) => p.repoNameWithOwner)).toEqual(['acme/a']);
  });
});
