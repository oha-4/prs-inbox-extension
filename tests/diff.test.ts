import { describe, expect, it } from 'vitest';
import {
  computeTabSyncPlan,
  forceExtraCloses,
  type DesiredTab,
  type ExistingTabInfo,
} from '../src/lib/diff';
import { makePlaceholderUrl, placeholderPrId } from '../src/lib/placeholder';
import type { OwnedTab } from '../src/types';

function desired(prId: string, opts: Partial<DesiredTab> = {}): DesiredTab {
  return {
    prId,
    url: `https://github.com/acme/widgets/pull/${prId}`,
    groupId: 'g1',
    groupTitle: 'Needs review',
    ...opts,
  };
}

function owned(prId: string, tabId: number, groupId = 'g1'): OwnedTab {
  return {
    prId,
    tabId,
    prUrl: `https://github.com/acme/widgets/pull/${prId}`,
    groupId,
  };
}

function placeholderDesired(groupId = 'g1', groupTitle = 'Needs review'): DesiredTab {
  return {
    prId: placeholderPrId(groupId),
    url: makePlaceholderUrl(groupId, groupTitle),
    groupId,
    groupTitle,
  };
}

function ownedPlaceholder(tabId: number, groupId = 'g1', groupTitle = 'Needs review'): OwnedTab {
  return {
    prId: placeholderPrId(groupId),
    tabId,
    prUrl: makePlaceholderUrl(groupId, groupTitle),
    groupId,
  };
}

const NO_TABS: ExistingTabInfo[] = [];

describe('computeTabSyncPlan', () => {
  it('creates tabs for new PRs', () => {
    const plan = computeTabSyncPlan({
      desired: [desired('1'), desired('2')],
      ownedTabs: [],
      existingTabs: NO_TABS,
      chromeGroupIdByGroup: {},
      autoClose: true,
    });
    expect(plan.toCreate.map((d) => d.prId)).toEqual(['1', '2']);
    expect(plan.toClose).toEqual([]);
  });

  it('keeps owned tabs whose PR is still desired', () => {
    const plan = computeTabSyncPlan({
      desired: [desired('1')],
      ownedTabs: [owned('1', 10)],
      existingTabs: [{ tabId: 10, url: 'https://github.com/acme/widgets/pull/1', groupId: 5 }],
      chromeGroupIdByGroup: { g1: 5 },
      autoClose: true,
    });
    expect(plan.toCreate).toEqual([]);
    expect(plan.keptOwned).toHaveLength(1);
    expect(plan.toClose).toEqual([]);
  });

  it('closes owned tabs when PR left the inbox (autoClose on)', () => {
    const plan = computeTabSyncPlan({
      desired: [],
      ownedTabs: [owned('1', 10)],
      existingTabs: NO_TABS,
      chromeGroupIdByGroup: {},
      autoClose: true,
    });
    expect(plan.toClose).toEqual([10]);
    expect(plan.toRelease).toEqual([]);
  });

  it('releases ownership instead of closing when autoClose is off', () => {
    const plan = computeTabSyncPlan({
      desired: [],
      ownedTabs: [owned('1', 10)],
      existingTabs: NO_TABS,
      chromeGroupIdByGroup: {},
      autoClose: false,
    });
    expect(plan.toClose).toEqual([]);
    expect(plan.toRelease).toEqual([{ groupId: 'g1', prId: '1' }]);
  });

  it('adopts an unowned tab already sitting in the target group', () => {
    const plan = computeTabSyncPlan({
      desired: [desired('1')],
      ownedTabs: [],
      existingTabs: [
        { tabId: 20, url: 'https://github.com/acme/widgets/pull/1/files', groupId: 5 },
      ],
      chromeGroupIdByGroup: { g1: 5 },
      autoClose: true,
    });
    expect(plan.toAdopt).toHaveLength(1);
    expect(plan.toAdopt[0]!.tabId).toBe(20);
    expect(plan.toCreate).toEqual([]);
  });

  it('leaves alone an existing PR tab outside all managed groups (no duplicate)', () => {
    const plan = computeTabSyncPlan({
      desired: [desired('1')],
      ownedTabs: [],
      existingTabs: [{ tabId: 20, url: 'https://github.com/acme/widgets/pull/1', groupId: -1 }],
      chromeGroupIdByGroup: { g1: 5 },
      autoClose: true,
    });
    expect(plan.toCreate).toEqual([]);
    expect(plan.toAdopt).toEqual([]);
    expect(plan.toClose).toEqual([]);
  });

  it('does not create when target group does not exist yet but a tab for the PR exists', () => {
    const plan = computeTabSyncPlan({
      desired: [desired('1')],
      ownedTabs: [],
      existingTabs: [{ tabId: 20, url: 'https://github.com/acme/widgets/pull/1', groupId: 99 }],
      chromeGroupIdByGroup: {},
      autoClose: true,
    });
    expect(plan.toCreate).toEqual([]);
    expect(plan.toAdopt).toEqual([]);
  });

  it('creates one tab per group when the same PR is desired in two groups', () => {
    const plan = computeTabSyncPlan({
      desired: [desired('1', { groupId: 'gA' }), desired('1', { groupId: 'gB' })],
      ownedTabs: [],
      existingTabs: NO_TABS,
      chromeGroupIdByGroup: {},
      autoClose: true,
    });
    expect(plan.toCreate.map((d) => d.groupId).sort()).toEqual(['gA', 'gB']);
  });

  it('dedupes duplicate desired entries within the same group (defensive)', () => {
    const plan = computeTabSyncPlan({
      desired: [desired('1'), desired('1')],
      ownedTabs: [],
      existingTabs: NO_TABS,
      chromeGroupIdByGroup: {},
      autoClose: true,
    });
    expect(plan.toCreate).toHaveLength(1);
  });

  it('moves an owned tab when its PR is remapped to another group (autoClose on)', () => {
    const plan = computeTabSyncPlan({
      desired: [desired('1', { groupId: 'gNew', groupTitle: 'New Group' })],
      ownedTabs: [owned('1', 10, 'gOld')],
      existingTabs: NO_TABS,
      chromeGroupIdByGroup: { gOld: 5 },
      autoClose: true,
    });
    expect(plan.toMove).toHaveLength(1);
    expect(plan.toMove[0]).toMatchObject({ tabId: 10, groupId: 'gNew', groupTitle: 'New Group' });
    expect(plan.toCreate).toEqual([]);
    expect(plan.toClose).toEqual([]);
  });

  it('move pairing consumes the release when autoClose is off', () => {
    const plan = computeTabSyncPlan({
      desired: [desired('1', { groupId: 'gNew', groupTitle: 'New Group' })],
      ownedTabs: [owned('1', 10, 'gOld')],
      existingTabs: NO_TABS,
      chromeGroupIdByGroup: { gOld: 5 },
      autoClose: false,
    });
    expect(plan.toMove.map((m) => m.tabId)).toEqual([10]);
    expect(plan.toRelease).toEqual([]);
    expect(plan.toCreate).toEqual([]);
  });

  it('pairs only one create with a single stale tab when the PR enters two groups', () => {
    const plan = computeTabSyncPlan({
      desired: [desired('1', { groupId: 'gA' }), desired('1', { groupId: 'gB' })],
      ownedTabs: [owned('1', 10, 'gOld')],
      existingTabs: NO_TABS,
      chromeGroupIdByGroup: { gOld: 5 },
      autoClose: true,
    });
    expect(plan.toMove).toHaveLength(1);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toClose).toEqual([]);
    const touchedGroups = [
      ...plan.toMove.map((m) => m.groupId),
      ...plan.toCreate.map((d) => d.groupId),
    ];
    expect(touchedGroups.sort()).toEqual(['gA', 'gB']);
  });

  it('claims an adoptable tab for the group that physically contains it; the other creates', () => {
    const plan = computeTabSyncPlan({
      desired: [desired('1', { groupId: 'gA' }), desired('1', { groupId: 'gB' })],
      ownedTabs: [],
      existingTabs: [{ tabId: 20, url: 'https://github.com/acme/widgets/pull/1', groupId: 5 }],
      chromeGroupIdByGroup: { gA: 5, gB: 6 },
      autoClose: true,
    });
    expect(plan.toAdopt.map((o) => o.groupId)).toEqual(['gA']);
    expect(plan.toCreate.map((d) => d.groupId)).toEqual(['gB']);
  });

  it('a tab in another managed group does not block creation', () => {
    const plan = computeTabSyncPlan({
      desired: [desired('1', { groupId: 'gB' })],
      ownedTabs: [],
      existingTabs: [{ tabId: 20, url: 'https://github.com/acme/widgets/pull/1', groupId: 5 }],
      chromeGroupIdByGroup: { gA: 5, gB: 6 },
      autoClose: true,
    });
    expect(plan.toCreate.map((d) => d.groupId)).toEqual(['gB']);
    expect(plan.toAdopt).toEqual([]);
  });

  it('an unmanaged matching tab suppresses creation in every group', () => {
    const plan = computeTabSyncPlan({
      desired: [desired('1', { groupId: 'gA' }), desired('1', { groupId: 'gB' })],
      ownedTabs: [],
      existingTabs: [{ tabId: 20, url: 'https://github.com/acme/widgets/pull/1', groupId: -1 }],
      chromeGroupIdByGroup: { gA: 5, gB: 6 },
      autoClose: true,
    });
    expect(plan.toCreate).toEqual([]);
    expect(plan.toAdopt).toEqual([]);
  });

  it('never closes tabs it does not own', () => {
    const plan = computeTabSyncPlan({
      desired: [],
      ownedTabs: [],
      existingTabs: [{ tabId: 30, url: 'https://github.com/acme/widgets/pull/7', groupId: 5 }],
      chromeGroupIdByGroup: { g1: 5 },
      autoClose: true,
    });
    expect(plan.toClose).toEqual([]);
  });
});

describe('computeTabSyncPlan (placeholders)', () => {
  it('creates the placeholder when all remaining owned tabs are closing (autoClose on)', () => {
    const plan = computeTabSyncPlan({
      desired: [placeholderDesired()],
      ownedTabs: [owned('1', 10)],
      existingTabs: [{ tabId: 10, url: 'https://github.com/acme/widgets/pull/1', groupId: 5 }],
      chromeGroupIdByGroup: { g1: 5 },
      autoClose: true,
    });
    expect(plan.toClose).toEqual([10]);
    expect(plan.toCreate.map((d) => d.prId)).toEqual([placeholderPrId('g1')]);
  });

  it('skips the placeholder when a released tab keeps the group alive (autoClose off)', () => {
    const plan = computeTabSyncPlan({
      desired: [placeholderDesired()],
      ownedTabs: [owned('1', 10)],
      existingTabs: [{ tabId: 10, url: 'https://github.com/acme/widgets/pull/1', groupId: 5 }],
      chromeGroupIdByGroup: { g1: 5 },
      autoClose: false,
    });
    expect(plan.toRelease).toEqual([{ groupId: 'g1', prId: '1' }]);
    expect(plan.toCreate).toEqual([]);
  });

  it("skips the placeholder when a user's arbitrary tab sits in the group", () => {
    const plan = computeTabSyncPlan({
      desired: [placeholderDesired()],
      ownedTabs: [],
      existingTabs: [{ tabId: 30, url: 'https://example.com/', groupId: 5 }],
      chromeGroupIdByGroup: { g1: 5 },
      autoClose: true,
    });
    expect(plan.toCreate).toEqual([]);
    expect(plan.toClose).toEqual([]);
  });

  it('creates the placeholder when the group does not exist yet', () => {
    const plan = computeTabSyncPlan({
      desired: [placeholderDesired()],
      ownedTabs: [],
      existingTabs: NO_TABS,
      chromeGroupIdByGroup: {},
      autoClose: true,
    });
    expect(plan.toCreate.map((d) => d.prId)).toEqual([placeholderPrId('g1')]);
  });

  it('keeps an owned placeholder while the group stays empty', () => {
    const plan = computeTabSyncPlan({
      desired: [placeholderDesired()],
      ownedTabs: [ownedPlaceholder(90)],
      existingTabs: [{ tabId: 90, url: makePlaceholderUrl('g1', 'Needs review'), groupId: 5 }],
      chromeGroupIdByGroup: { g1: 5 },
      autoClose: true,
    });
    expect(plan.keptOwned).toHaveLength(1);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toClose).toEqual([]);
  });

  it('adopts an unowned placeholder tab already in the target group (browser restart)', () => {
    const plan = computeTabSyncPlan({
      desired: [placeholderDesired()],
      ownedTabs: [],
      existingTabs: [{ tabId: 40, url: makePlaceholderUrl('g1', 'Needs review'), groupId: 5 }],
      chromeGroupIdByGroup: { g1: 5 },
      autoClose: true,
    });
    expect(plan.toAdopt.map((o) => o.tabId)).toEqual([40]);
    expect(plan.toCreate).toEqual([]);
  });

  it('closes the owned placeholder when PRs return, even with autoClose off', () => {
    const plan = computeTabSyncPlan({
      desired: [desired('1')],
      ownedTabs: [ownedPlaceholder(90)],
      existingTabs: [{ tabId: 90, url: makePlaceholderUrl('g1', 'Needs review'), groupId: 5 }],
      chromeGroupIdByGroup: { g1: 5 },
      autoClose: false,
    });
    expect(plan.toClose).toEqual([90]);
    expect(plan.toRelease).toEqual([]);
    expect(plan.toCreate.map((d) => d.prId)).toEqual(['1']);
  });

  it('closes the owned placeholder when the setting is turned off (no longer desired)', () => {
    const plan = computeTabSyncPlan({
      desired: [],
      ownedTabs: [ownedPlaceholder(90)],
      existingTabs: [{ tabId: 90, url: makePlaceholderUrl('g1', 'Needs review'), groupId: 5 }],
      chromeGroupIdByGroup: { g1: 5 },
      autoClose: false,
    });
    expect(plan.toClose).toEqual([90]);
    expect(plan.toRelease).toEqual([]);
  });

  it('leaves alone a placeholder tab outside the target group (no duplicate)', () => {
    const plan = computeTabSyncPlan({
      desired: [placeholderDesired()],
      ownedTabs: [],
      existingTabs: [{ tabId: 40, url: makePlaceholderUrl('g1', 'Needs review'), groupId: -1 }],
      chromeGroupIdByGroup: { g1: 5 },
      autoClose: true,
    });
    expect(plan.toAdopt).toEqual([]);
    expect(plan.toCreate).toEqual([]);
  });

  it('creates the placeholder for a group vacated by a move to another group', () => {
    const plan = computeTabSyncPlan({
      desired: [
        desired('1', { groupId: 'gNew', groupTitle: 'New Group' }),
        placeholderDesired('g1', 'Needs review'),
      ],
      ownedTabs: [owned('1', 10)],
      existingTabs: [{ tabId: 10, url: 'https://github.com/acme/widgets/pull/1', groupId: 5 }],
      chromeGroupIdByGroup: { g1: 5 },
      autoClose: true,
    });
    expect(plan.toMove.map((m) => m.tabId)).toEqual([10]);
    expect(plan.toCreate.map((d) => d.prId)).toEqual([placeholderPrId('g1')]);
  });
});

describe('forceExtraCloses', () => {
  const managed = (tabId: number, url: string, groupId = 'g1') => ({
    tabId,
    url,
    groupId,
  });

  it('closes user-added and non-PR tabs in managed groups', () => {
    const closes = forceExtraCloses(
      [
        managed(1, 'https://github.com/acme/widgets/pull/1'), // desired, keep
        managed(2, 'https://github.com/acme/widgets/pull/99'), // not desired, close
        managed(3, 'https://example.com/'), // non-PR, close
      ],
      [desired('1')],
    );
    expect(closes.sort()).toEqual([2, 3]);
  });

  it('keeps a desired PR tab even on a sub-page URL', () => {
    const closes = forceExtraCloses(
      [managed(1, 'https://github.com/acme/widgets/pull/1/files')],
      [desired('1')],
    );
    expect(closes).toEqual([]);
  });

  it('closes a desired PR tab that sits in the wrong group', () => {
    const closes = forceExtraCloses(
      [managed(1, 'https://github.com/acme/widgets/pull/1', 'gOther')],
      [desired('1')],
    );
    expect(closes).toEqual([1]);
  });

  it('keeps the same PR in two groups when both desire it', () => {
    const closes = forceExtraCloses(
      [
        managed(1, 'https://github.com/acme/widgets/pull/1', 'gA'),
        managed(2, 'https://github.com/acme/widgets/pull/1', 'gB'),
      ],
      [desired('1', { groupId: 'gA' }), desired('1', { groupId: 'gB' })],
    );
    expect(closes).toEqual([]);
  });

  it('closes a duplicate of a desired PR, keeping exactly one', () => {
    const closes = forceExtraCloses(
      [
        managed(1, 'https://github.com/acme/widgets/pull/1'),
        managed(2, 'https://github.com/acme/widgets/pull/1/files'), // same PR, another tab
      ],
      [desired('1')],
    );
    expect(closes).toEqual([2]);
  });

  it('keeps one tab per desired PR when several are duplicated', () => {
    const closes = forceExtraCloses(
      [
        managed(1, 'https://github.com/acme/widgets/pull/1'),
        managed(2, 'https://github.com/acme/widgets/pull/1'),
        managed(3, 'https://github.com/acme/widgets/pull/2'),
        managed(4, 'https://github.com/acme/widgets/pull/2'),
        managed(5, 'https://github.com/acme/widgets/pull/2'),
      ],
      [desired('1'), desired('2')],
    );
    expect(closes.sort((a, b) => a - b)).toEqual([2, 4, 5]);
  });

  it('does not treat the same PR in two different groups as a duplicate', () => {
    const closes = forceExtraCloses(
      [
        managed(1, 'https://github.com/acme/widgets/pull/1', 'gA'),
        managed(2, 'https://github.com/acme/widgets/pull/1', 'gB'),
      ],
      [desired('1', { groupId: 'gA' }), desired('1', { groupId: 'gB' })],
    );
    expect(closes).toEqual([]);
  });

  it('closes duplicate placeholder tabs, keeping one', () => {
    const closes = forceExtraCloses(
      [
        managed(1, makePlaceholderUrl('g1', 'Needs review')),
        managed(2, makePlaceholderUrl('g1', 'Needs review')),
      ],
      [placeholderDesired()],
    );
    expect(closes).toEqual([2]);
  });

  it('keeps a desired placeholder tab', () => {
    const closes = forceExtraCloses(
      [managed(1, makePlaceholderUrl('g1', 'Needs review'))],
      [placeholderDesired()],
    );
    expect(closes).toEqual([]);
  });

  it('closes a placeholder in a group that no longer desires it', () => {
    const closes = forceExtraCloses(
      [managed(1, makePlaceholderUrl('g1', 'Needs review'))],
      [desired('1')],
    );
    expect(closes).toEqual([1]);
  });
});
