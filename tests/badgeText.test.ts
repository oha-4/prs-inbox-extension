import { describe, expect, it } from 'vitest';
import { BADGE_MAX, badgeText } from '../src/lib/badgeText';
import { defaultSettings } from '../src/lib/settings';
import type { InboxSection, PullRequest, Settings } from '../src/types';

function pr(id: string): PullRequest {
  return {
    id,
    number: 1,
    title: 't',
    url: `https://github.com/acme/widgets/pull/1`,
    repoNameWithOwner: 'acme/widgets',
    authorLogin: 'a',
    state: 'OPEN',
    isDraft: false,
    commentCount: 0,
    isReadByCurrentUser: true,
    createdAt: '',
    updatedAt: '',
  };
}

function section(id: string, count: number, truncated?: boolean): InboxSection {
  return {
    id,
    label: id,
    prs: Array.from({ length: count }, (_, i) => pr(`${id}-${i}`)),
    ...(truncated === undefined ? {} : { truncated }),
  };
}

function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...defaultSettings(), badgeIncludeTeamReview: false, ...overrides };
}

describe('badgeText', () => {
  it('returns the plain count when nothing is truncated', () => {
    const sections = [section('review-requested', 5)];
    expect(badgeText(sections, settings())).toBe('5');
  });

  it('returns empty string for zero PRs', () => {
    expect(badgeText([section('review-requested', 0)], settings())).toBe('');
    expect(badgeText([], settings())).toBe('');
  });

  it('appends "+" when a target section is truncated', () => {
    const sections = [section('review-requested', 100, true)];
    expect(badgeText(sections, settings())).toBe('100+');
  });

  it('does not append "+" when truncation is on a non-target section', () => {
    const sections = [section('review-requested', 3), section('team-review-requested', 50, true)];
    // team review not included -> its truncation is irrelevant
    expect(badgeText(sections, settings({ badgeIncludeTeamReview: false }))).toBe('3');
  });

  it('includes team-review-requested when badgeIncludeTeamReview is on', () => {
    const sections = [section('review-requested', 3), section('team-review-requested', 4)];
    expect(badgeText(sections, settings({ badgeIncludeTeamReview: true }))).toBe('7');
  });

  it('appends "+" when the team section is truncated and included', () => {
    const sections = [section('review-requested', 3), section('team-review-requested', 100, true)];
    expect(badgeText(sections, settings({ badgeIncludeTeamReview: true }))).toBe('103+');
  });

  it('caps counts over BADGE_MAX to "999+"', () => {
    const sections = [section('review-requested', BADGE_MAX + 1)];
    expect(badgeText(sections, settings())).toBe('999+');
  });

  it('shows "999+" for exactly BADGE_MAX without a truncation flag', () => {
    expect(badgeText([section('review-requested', BADGE_MAX)], settings())).toBe('999');
    expect(badgeText([section('review-requested', BADGE_MAX, true)], settings())).toBe('999+');
  });

  it('ignores sections outside the badge targets', () => {
    const sections = [section('review-requested', 2), section('needs-action', 99, true)];
    expect(badgeText(sections, settings())).toBe('2');
  });
});
