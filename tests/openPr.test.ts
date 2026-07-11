import { describe, expect, it } from 'vitest';
import { findSyncedTab, resolveClickAction } from '../src/lib/openPr';
import type { OwnedTab } from '../src/types';

function tab(tabId: number, prUrl: string): OwnedTab {
  return { tabId, prId: `pr-${tabId}`, prUrl, groupId: 'g1' };
}

describe('findSyncedTab', () => {
  it('returns the owned tab whose prUrl points at the same PR (sub-pages/anchors match)', () => {
    const owned = [
      tab(1, 'https://github.com/acme/widgets/pull/10'),
      tab(2, 'https://github.com/acme/widgets/pull/20/files'),
    ];
    expect(findSyncedTab(owned, 'https://github.com/acme/widgets/pull/20')?.tabId).toBe(2);
    expect(
      findSyncedTab(owned, 'https://github.com/acme/widgets/pull/20#discussion_r1')?.tabId,
    ).toBe(2);
  });

  it('returns undefined when no owned tab matches', () => {
    const owned = [tab(1, 'https://github.com/acme/widgets/pull/10')];
    expect(findSyncedTab(owned, 'https://github.com/acme/widgets/pull/99')).toBeUndefined();
    expect(findSyncedTab([], 'https://github.com/acme/widgets/pull/10')).toBeUndefined();
  });

  it('returns the first match when the same PR is owned in several groups', () => {
    const owned = [
      { ...tab(3, 'https://github.com/acme/widgets/pull/5'), groupId: 'a' },
      { ...tab(4, 'https://github.com/acme/widgets/pull/5'), groupId: 'b' },
    ];
    expect(findSyncedTab(owned, 'https://github.com/acme/widgets/pull/5')?.tabId).toBe(3);
  });

  it('ignores non-PR URLs (never matches, no crash)', () => {
    const owned = [tab(1, 'https://github.com/acme/widgets')];
    expect(findSyncedTab(owned, 'https://github.com/acme/widgets/pull/10')).toBeUndefined();
    expect(findSyncedTab([tab(1, 'chrome://newtab/')], 'chrome://newtab/')).toBeUndefined();
  });
});

describe('resolveClickAction', () => {
  it('maps each behavior to its action when unmodified', () => {
    expect(resolveClickAction('newTab', false)).toBe('foreground');
    expect(resolveClickAction('reuseSynced', false)).toBe('reuseSynced');
    expect(resolveClickAction('background', false)).toBe('background');
  });

  it('always opens in the background on a modified (Cmd/Ctrl) click', () => {
    expect(resolveClickAction('newTab', true)).toBe('background');
    expect(resolveClickAction('reuseSynced', true)).toBe('background');
    expect(resolveClickAction('background', true)).toBe('background');
  });
});
