import { describe, expect, it } from 'vitest';
import {
  computeTabSyncPlan,
  forceExtraCloses,
  type DesiredTab,
  type ExistingTabInfo,
} from '../src/lib/diff';
import type { OwnedTab } from '../src/types';

function desired(prId: string, opts: Partial<DesiredTab> = {}): DesiredTab {
  return {
    prId,
    url: `https://github.com/acme/widgets/pull/${prId}`,
    groupName: 'Needs review',
    groupColor: 'yellow',
    ...opts,
  };
}

function owned(prId: string, tabId: number, groupName = 'Needs review'): OwnedTab {
  return {
    prId,
    tabId,
    prUrl: `https://github.com/acme/widgets/pull/${prId}`,
    groupName,
  };
}

const NO_TABS: ExistingTabInfo[] = [];

describe('computeTabSyncPlan', () => {
  it('creates tabs for new PRs', () => {
    const plan = computeTabSyncPlan({
      desired: [desired('1'), desired('2')],
      ownedTabs: [],
      existingTabs: NO_TABS,
      groupIdByName: {},
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
      groupIdByName: { 'Needs review': 5 },
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
      groupIdByName: {},
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
      groupIdByName: {},
      autoClose: false,
    });
    expect(plan.toClose).toEqual([]);
    expect(plan.toRelease).toEqual(['1']);
  });

  it('adopts an unowned tab already sitting in the target group', () => {
    const plan = computeTabSyncPlan({
      desired: [desired('1')],
      ownedTabs: [],
      existingTabs: [
        { tabId: 20, url: 'https://github.com/acme/widgets/pull/1/files', groupId: 5 },
      ],
      groupIdByName: { 'Needs review': 5 },
      autoClose: true,
    });
    expect(plan.toAdopt).toHaveLength(1);
    expect(plan.toAdopt[0]!.tabId).toBe(20);
    expect(plan.toCreate).toEqual([]);
  });

  it('leaves alone an existing PR tab outside the target group (no duplicate)', () => {
    const plan = computeTabSyncPlan({
      desired: [desired('1')],
      ownedTabs: [],
      existingTabs: [{ tabId: 20, url: 'https://github.com/acme/widgets/pull/1', groupId: -1 }],
      groupIdByName: { 'Needs review': 5 },
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
      groupIdByName: {},
      autoClose: true,
    });
    expect(plan.toCreate).toEqual([]);
    expect(plan.toAdopt).toEqual([]);
  });

  it('dedupes a PR appearing in two sections mapped to the same plan (first wins)', () => {
    const plan = computeTabSyncPlan({
      desired: [desired('1', { groupName: 'Group A' }), desired('1', { groupName: 'Group B' })],
      ownedTabs: [],
      existingTabs: NO_TABS,
      groupIdByName: {},
      autoClose: true,
    });
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0]!.groupName).toBe('Group A');
  });

  it('moves an owned tab when its section is remapped to another group', () => {
    const plan = computeTabSyncPlan({
      desired: [desired('1', { groupName: 'New Group', groupColor: 'blue' })],
      ownedTabs: [owned('1', 10, 'Old Group')],
      existingTabs: NO_TABS,
      groupIdByName: { 'Old Group': 5 },
      autoClose: true,
    });
    expect(plan.toMove).toHaveLength(1);
    expect(plan.toMove[0]).toMatchObject({ tabId: 10, groupName: 'New Group' });
    expect(plan.toCreate).toEqual([]);
    expect(plan.toClose).toEqual([]);
  });

  it('never closes tabs it does not own', () => {
    const plan = computeTabSyncPlan({
      desired: [],
      ownedTabs: [],
      existingTabs: [{ tabId: 30, url: 'https://github.com/acme/widgets/pull/7', groupId: 5 }],
      groupIdByName: { 'Needs review': 5 },
      autoClose: true,
    });
    expect(plan.toClose).toEqual([]);
  });
});

describe('forceExtraCloses', () => {
  const managed = (tabId: number, url: string, groupName = 'Needs review') => ({
    tabId,
    url,
    groupName,
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
      [managed(1, 'https://github.com/acme/widgets/pull/1', 'Other group')],
      [{ ...desired('1'), groupName: 'G' }],
    );
    expect(closes).toEqual([1]);
  });
});
