import { describe, expect, it } from 'vitest';
import { buildDesired } from '../src/lib/buildDesired';
import { makePlaceholderUrl, placeholderPrId } from '../src/lib/placeholder';
import { mergeSettings } from '../src/lib/settings';
import type { InboxSection, PullRequest, SyncGroup } from '../src/types';

let n = 0;
function pr(id: string, repo = 'acme/widgets'): PullRequest {
  n += 1;
  return {
    id,
    number: n,
    title: `PR ${id}`,
    url: `https://github.com/${repo}/pull/${n}`,
    repoNameWithOwner: repo,
    authorLogin: 'octocat',
    state: 'OPEN',
    isDraft: false,
    commentCount: 0,
    isReadByCurrentUser: false,
    createdAt: `2026-01-0${(n % 9) + 1}T00:00:00Z`,
    updatedAt: `2026-01-0${(n % 9) + 1}T00:00:00Z`,
  };
}

function section(id: string, prs: PullRequest[]): InboxSection {
  return { id, label: id, prs };
}

function settingsWith(groups: SyncGroup[], extra: Record<string, unknown> = {}) {
  return mergeSettings({ syncGroups: groups, ...extra });
}

describe('buildDesired', () => {
  it('dedupes a PR appearing in two sections of the same group', () => {
    const shared = pr('shared');
    const { desired } = buildDesired(
      [section('review-requested', [shared]), section('needs-action', [shared])],
      settingsWith([{ id: 'g1', name: 'G', sectionIds: ['review-requested', 'needs-action'] }]),
    );
    expect(desired).toHaveLength(1);
    expect(desired[0]).toMatchObject({ prId: 'shared', groupId: 'g1', groupTitle: 'G' });
  });

  it('emits one entry per group when the same section feeds two groups', () => {
    const p = pr('p1');
    const { desired, orderByGroup } = buildDesired(
      [section('review-requested', [p])],
      settingsWith([
        { id: 'gA', name: 'A', sectionIds: ['review-requested'] },
        { id: 'gB', name: 'B', sectionIds: ['review-requested'] },
      ]),
    );
    expect(desired.map((d) => d.groupId).sort()).toEqual(['gA', 'gB']);
    expect(orderByGroup.get('gA')).toEqual(['p1']);
    expect(orderByGroup.get('gB')).toEqual(['p1']);
  });

  it('skips inert groups (empty name or no sections)', () => {
    const p = pr('p1');
    const { desired, orderByGroup } = buildDesired(
      [section('review-requested', [p])],
      settingsWith([
        { id: 'g1', name: '', sectionIds: ['review-requested'] },
        { id: 'g2', name: 'No sections', sectionIds: [] },
      ]),
    );
    expect(desired).toEqual([]);
    expect(orderByGroup.size).toBe(0);
  });

  it('feeds custom sections into groups', () => {
    const p = pr('p1');
    const { desired } = buildDesired(
      [section('custom:a', [p])],
      settingsWith([{ id: 'g1', name: 'G', sectionIds: ['custom:a'] }], {
        customSections: [{ id: 'custom:a', name: 'Urgent', query: 'label:urgent' }],
      }),
    );
    expect(desired.map((d) => d.prId)).toEqual(['p1']);
  });

  it('ignores unknown sectionIds (inert reference)', () => {
    const { desired, orderByGroup } = buildDesired(
      [],
      settingsWith([{ id: 'g1', name: 'G', sectionIds: ['custom:gone'] }]),
    );
    expect(desired).toEqual([]);
    expect(orderByGroup.size).toBe(0);
  });

  it('adds a placeholder for empty active groups when keepEmptyGroups is on', () => {
    const { desired, orderByGroup } = buildDesired(
      [section('review-requested', [])],
      settingsWith([{ id: 'g1', name: 'G', sectionIds: ['review-requested'] }], {
        keepEmptyGroups: true,
      }),
    );
    expect(desired).toEqual([
      {
        prId: placeholderPrId('g1'),
        url: makePlaceholderUrl('g1', 'G'),
        groupId: 'g1',
        groupTitle: 'G',
      },
    ]);
    // Phase 0a のグループ養子縁組が orderByGroup のキーを見るため空登録が必要
    expect(orderByGroup.get('g1')).toEqual([]);
  });

  it('adds no placeholder when keepEmptyGroups is off', () => {
    const { desired, orderByGroup } = buildDesired(
      [section('review-requested', [])],
      settingsWith([{ id: 'g1', name: 'G', sectionIds: ['review-requested'] }]),
    );
    expect(desired).toEqual([]);
    expect(orderByGroup.size).toBe(0);
  });

  it('follows the group sectionIds order (not canonical section order) when no sort is set', () => {
    const a = pr('a');
    const b = pr('b');
    const { orderByGroup } = buildDesired(
      // review-requested が正準順では先だが、グループには needs-action を先に追加してある
      [section('review-requested', [b]), section('needs-action', [a])],
      settingsWith([{ id: 'g1', name: 'G', sectionIds: ['needs-action', 'review-requested'] }], {
        sortCriteria: [],
      }),
    );
    expect(orderByGroup.get('g1')).toEqual(['a', 'b']);
  });

  it('preserves section-merge order with empty sortCriteria (no PR-number fallback sort)', () => {
    const late = pr('late'); // number が小さい方を後ろに置く
    const early = pr('early');
    const { orderByGroup } = buildDesired(
      [section('review-requested', [early, late])],
      settingsWith([{ id: 'g1', name: 'G', sectionIds: ['review-requested'] }], {
        sortCriteria: [],
      }),
    );
    expect(orderByGroup.get('g1')).toEqual(['early', 'late']);
  });

  it('applies sortCriteria within each group', () => {
    const a = pr('a', 'acme/zzz');
    const b = pr('b', 'acme/aaa');
    const { orderByGroup } = buildDesired(
      [section('review-requested', [a, b])],
      settingsWith([{ id: 'g1', name: 'G', sectionIds: ['review-requested'] }], {
        sortCriteria: [{ key: 'repo', dir: 'asc' }],
      }),
    );
    expect(orderByGroup.get('g1')).toEqual(['b', 'a']);
  });

  it('applies allowlist/blocklist filters before grouping', () => {
    const keep = pr('keep', 'acme/widgets');
    const drop = pr('drop', 'evil/co');
    const { desired } = buildDesired(
      [section('review-requested', [keep, drop])],
      settingsWith([{ id: 'g1', name: 'G', sectionIds: ['review-requested'] }], {
        blocklist: ['evil'],
      }),
    );
    expect(desired.map((d) => d.prId)).toEqual(['keep']);
  });
});
