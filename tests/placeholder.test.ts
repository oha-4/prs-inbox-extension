import { describe, expect, it } from 'vitest';
import type { OwnedTab } from '../src/types';
import {
  isPlaceholderId,
  makePlaceholderUrl,
  orphanedPlaceholderTabIds,
  PLACEHOLDER_URL_BASE,
  placeholderKey,
  placeholderPrId,
  tabKey,
} from '../src/lib/placeholder';

describe('makePlaceholderUrl / placeholderKey', () => {
  it('round-trips the group id through the URL fragment', () => {
    expect(placeholderKey(makePlaceholderUrl('g1', 'My Group'))).toBe(placeholderPrId('g1'));
  });

  it('round-trips ids and names with special characters', () => {
    const cases: Array<[string, string]> = [
      ['default', 'Needs review'],
      ['a1b2-c3d4', 'A&B=C#D'],
      ['グループ', '日本語 グループ'],
      ['g&=id', '🎉 zero'],
      ['g+id', 'a+b'],
      ['100%', 'trailing '],
    ];
    for (const [id, name] of cases) {
      expect(placeholderKey(makePlaceholderUrl(id, name))).toBe(placeholderPrId(id));
    }
  });

  it('tolerates a missing trailing slash', () => {
    expect(
      placeholderKey('https://oha-4.github.io/prs-inbox-extension/inbox-zero#gid=g1&group=G'),
    ).toBe(placeholderPrId('g1'));
  });

  it('returns null for legacy group-only URLs (no gid)', () => {
    expect(placeholderKey(`${PLACEHOLDER_URL_BASE}#group=Name`)).toBeNull();
  });

  it('returns null for non-placeholder URLs', () => {
    expect(placeholderKey('https://github.com/acme/widgets/pull/1')).toBeNull();
    expect(placeholderKey('https://oha-4.github.io/prs-inbox-extension/')).toBeNull();
    expect(placeholderKey('https://oha-4.github.io/other/inbox-zero/#gid=g1')).toBeNull();
    expect(placeholderKey('https://example.com/prs-inbox-extension/inbox-zero/#gid=g1')).toBeNull();
    expect(placeholderKey('not a url')).toBeNull();
    expect(placeholderKey('')).toBeNull();
  });

  it('returns null when the gid param is missing or empty', () => {
    expect(placeholderKey(PLACEHOLDER_URL_BASE)).toBeNull();
    expect(placeholderKey(`${PLACEHOLDER_URL_BASE}#`)).toBeNull();
    expect(placeholderKey(`${PLACEHOLDER_URL_BASE}#gid=`)).toBeNull();
    expect(placeholderKey(`${PLACEHOLDER_URL_BASE}#other=x`)).toBeNull();
  });
});

describe('tabKey', () => {
  it('uses the PR key for PR URLs', () => {
    expect(tabKey('https://github.com/Acme/Widgets/pull/7/files')).toBe('acme/widgets#7');
  });

  it('uses the placeholder key for placeholder URLs', () => {
    expect(tabKey(makePlaceholderUrl('g1', 'Needs review'))).toBe(placeholderPrId('g1'));
  });

  it('returns null for anything else', () => {
    expect(tabKey('https://example.com/')).toBeNull();
    expect(tabKey('')).toBeNull();
  });
});

describe('isPlaceholderId', () => {
  it('detects placeholder prIds and nothing else', () => {
    expect(isPlaceholderId(placeholderPrId('g1'))).toBe(true);
    expect(isPlaceholderId('PR_kwDOAbc123')).toBe(false);
    expect(isPlaceholderId('')).toBe(false);
  });
});

describe('orphanedPlaceholderTabIds', () => {
  const placeholderTab = (tabId: number, groupId: string): OwnedTab => ({
    tabId,
    prId: placeholderPrId(groupId),
    prUrl: makePlaceholderUrl(groupId, `Group ${groupId}`),
    groupId,
  });
  const prTab = (tabId: number, groupId: string): OwnedTab => ({
    tabId,
    prId: 'PR_kwDOAbc123',
    prUrl: 'https://github.com/acme/widgets/pull/1',
    groupId,
  });

  it('closes placeholders whose group was deleted from settings', () => {
    const owned = [placeholderTab(11, 'gone'), placeholderTab(22, 'kept')];
    expect(orphanedPlaceholderTabIds(owned, new Set(['kept']))).toEqual([11]);
  });

  it('keeps placeholders whose group still exists', () => {
    const owned = [placeholderTab(11, 'kept'), placeholderTab(22, 'also-kept')];
    expect(orphanedPlaceholderTabIds(owned, new Set(['kept', 'also-kept']))).toEqual([]);
  });

  it('never closes PR tabs even when their group was deleted', () => {
    const owned = [prTab(11, 'gone'), placeholderTab(22, 'gone')];
    // released PR タブは対象外、プレースホルダのみ閉じる
    expect(orphanedPlaceholderTabIds(owned, new Set())).toEqual([22]);
  });

  it('returns empty for no owned tabs', () => {
    expect(orphanedPlaceholderTabIds([], new Set(['g1']))).toEqual([]);
  });

  it('handles several deleted groups at once', () => {
    const owned = [
      placeholderTab(1, 'a'),
      placeholderTab(2, 'b'),
      placeholderTab(3, 'c'),
      prTab(4, 'a'),
    ];
    expect(orphanedPlaceholderTabIds(owned, new Set(['b']))).toEqual([1, 3]);
  });
});
