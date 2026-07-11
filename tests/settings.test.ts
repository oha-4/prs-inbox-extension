import { describe, expect, it } from 'vitest';
import {
  activeSyncGroups,
  defaultSettings,
  inboxOrderIndex,
  isSectionHidden,
  listSections,
  MAX_CUSTOM_SECTIONS,
  MAX_SYNC_GROUPS,
  mergeSettings,
  orderedInboxSections,
  pollTargets,
  SECTION_ORDER,
  sectionOrderIndex,
} from '../src/lib/settings';

describe('mergeSettings', () => {
  it('returns defaults for empty/invalid input', () => {
    expect(mergeSettings(undefined)).toEqual(defaultSettings());
    expect(mergeSettings(null)).toEqual(defaultSettings());
    expect(mergeSettings('junk')).toEqual(defaultSettings());
  });

  it('defaults to a single group syncing review-requested', () => {
    const s = defaultSettings();
    expect(s.syncGroups).toEqual([
      { id: 'default', name: 'Needs review', sectionIds: ['review-requested'] },
    ]);
    expect(s.customSections).toEqual([]);
  });

  it('ignores the legacy sections key (pre-group-first schema)', () => {
    const s = mergeSettings({
      sections: { 'your-drafts': { enabled: true, groupName: 'Drafts', groupColor: 'blue' } },
    });
    expect(s).toEqual(defaultSettings());
  });

  it('keeps stored overrides and fills missing fields', () => {
    const s = mergeSettings({
      pollIntervalMinutes: 10,
      syncGroups: [{ id: 'g1', name: 'Work', sectionIds: ['your-drafts'] }],
    });
    expect(s.pollIntervalMinutes).toBe(10);
    expect(s.maxPrAge).toBe('1m');
    expect(s.syncGroups).toEqual([{ id: 'g1', name: 'Work', sectionIds: ['your-drafts'] }]);
  });

  it('rejects invalid interval values', () => {
    expect(mergeSettings({ pollIntervalMinutes: 0 }).pollIntervalMinutes).toBe(5);
    expect(mergeSettings({ pollIntervalMinutes: -3 }).pollIntervalMinutes).toBe(5);
  });

  it('defaults badgeIncludeTeamReview off and respects the stored value', () => {
    expect(defaultSettings().badgeIncludeTeamReview).toBe(false);
    expect(mergeSettings({ badgeIncludeTeamReview: true }).badgeIncludeTeamReview).toBe(true);
  });

  it('defaults the badge on and respects disabling it', () => {
    expect(defaultSettings().badgeEnabled).toBe(true);
    expect(mergeSettings({ badgeEnabled: false }).badgeEnabled).toBe(false);
  });

  it('defaults sort to repo then created-oldest', () => {
    expect(defaultSettings().sortCriteria).toEqual([
      { key: 'repo', dir: 'asc' },
      { key: 'created', dir: 'asc' },
    ]);
  });

  it('sanitizes stored sort: drops unknown/duplicate keys and caps at 2', () => {
    const s = mergeSettings({
      sortCriteria: [
        { key: 'updated', dir: 'desc' },
        { key: 'bogus', dir: 'asc' },
        { key: 'updated', dir: 'asc' },
        { key: 'repo', dir: 'asc' },
        { key: 'created', dir: 'asc' },
      ],
    });
    expect(s.sortCriteria).toEqual([
      { key: 'updated', dir: 'desc' },
      { key: 'repo', dir: 'asc' },
    ]);
  });

  it('defaults forceAlignOnRefresh off', () => {
    expect(defaultSettings().forceAlignOnRefresh).toBe(false);
    expect(mergeSettings({ forceAlignOnRefresh: true }).forceAlignOnRefresh).toBe(true);
  });

  it('defaults keepEmptyGroups off and respects the stored value', () => {
    expect(defaultSettings().keepEmptyGroups).toBe(false);
    expect(mergeSettings({ keepEmptyGroups: true }).keepEmptyGroups).toBe(true);
    expect(mergeSettings({ keepEmptyGroups: 'yes' }).keepEmptyGroups).toBe(false);
  });

  it('defaults hiddenSections and inboxOrder to empty arrays', () => {
    expect(defaultSettings().hiddenSections).toEqual([]);
    expect(defaultSettings().inboxOrder).toEqual([]);
  });

  it('sanitizes hiddenSections/inboxOrder: drops blanks, dedupes, ignores non-arrays', () => {
    expect(
      mergeSettings({ hiddenSections: ['review-requested', '', '  '] }).hiddenSections,
    ).toEqual(['review-requested']);
    expect(mergeSettings({ inboxOrder: ['a', 'a', 'b'] }).inboxOrder).toEqual(['a', 'b']);
    expect(mergeSettings({ hiddenSections: 'x' }).hiddenSections).toEqual([]);
    expect(mergeSettings({ inboxOrder: 42 }).inboxOrder).toEqual([]);
  });

  describe('syncGroups sanitization', () => {
    it('drops entries without a stable id and never regenerates ids', () => {
      const s = mergeSettings({
        syncGroups: [
          { name: 'No id', sectionIds: ['review-requested'] },
          { id: '', name: 'Empty id', sectionIds: [] },
          { id: 'g1', name: 'Kept', sectionIds: ['review-requested'] },
          'junk',
        ],
      });
      expect(s.syncGroups).toEqual([{ id: 'g1', name: 'Kept', sectionIds: ['review-requested'] }]);
    });

    it('dedupes group ids (first wins) and sectionIds within a group', () => {
      const s = mergeSettings({
        syncGroups: [
          { id: 'g1', name: 'First', sectionIds: ['a', 'a', '', 'b'] },
          { id: 'g1', name: 'Second', sectionIds: [] },
        ],
      });
      expect(s.syncGroups).toEqual([{ id: 'g1', name: 'First', sectionIds: ['a', 'b'] }]);
    });

    it('keeps empty-name groups (mid-edit state survives reload)', () => {
      const s = mergeSettings({ syncGroups: [{ id: 'g1', name: '', sectionIds: ['a'] }] });
      expect(s.syncGroups).toEqual([{ id: 'g1', name: '', sectionIds: ['a'] }]);
    });

    it('keeps unknown sectionIds (inert at sync time; UI cleans up references)', () => {
      const s = mergeSettings({
        syncGroups: [{ id: 'g1', name: 'G', sectionIds: ['custom:gone'] }],
      });
      expect(s.syncGroups[0]!.sectionIds).toEqual(['custom:gone']);
    });

    it(`caps at ${MAX_SYNC_GROUPS} groups`, () => {
      const many = Array.from({ length: MAX_SYNC_GROUPS + 5 }, (_, i) => ({
        id: `g${i}`,
        name: `G${i}`,
        sectionIds: [],
      }));
      expect(mergeSettings({ syncGroups: many }).syncGroups).toHaveLength(MAX_SYNC_GROUPS);
    });
  });

  describe('customSections sanitization', () => {
    it('requires the custom: id prefix and dedupes ids', () => {
      const s = mergeSettings({
        customSections: [
          { id: 'review-requested', name: 'Spoof', query: 'x' },
          { id: 'custom:a', name: 'A', query: 'org:foo' },
          { id: 'custom:a', name: 'Dup', query: 'org:bar' },
          { id: 'custom:b', name: '  B  ', query: '  org:baz  ' },
        ],
      });
      expect(s.customSections).toEqual([
        { id: 'custom:a', name: 'A', query: 'org:foo' },
        { id: 'custom:b', name: 'B', query: 'org:baz' },
      ]);
    });

    it('keeps empty name/query (mid-edit state)', () => {
      const s = mergeSettings({ customSections: [{ id: 'custom:a', name: '', query: '' }] });
      expect(s.customSections).toEqual([{ id: 'custom:a', name: '', query: '' }]);
    });

    it(`caps at ${MAX_CUSTOM_SECTIONS} custom sections`, () => {
      const many = Array.from({ length: MAX_CUSTOM_SECTIONS + 5 }, (_, i) => ({
        id: `custom:${i}`,
        name: '',
        query: 'q',
      }));
      expect(mergeSettings({ customSections: many }).customSections).toHaveLength(
        MAX_CUSTOM_SECTIONS,
      );
    });
  });
});

describe('section helpers', () => {
  const withCustom = mergeSettings({
    customSections: [
      { id: 'custom:a', name: 'Urgent', query: 'label:urgent' },
      { id: 'custom:b', name: '', query: 'org:foo' },
      { id: 'custom:c', name: 'Empty query', query: '' },
    ],
  });

  it('listSections returns known sections then customs, labelling nameless ones by query', () => {
    const list = listSections(withCustom);
    expect(list.slice(0, SECTION_ORDER.length).map((i) => i.id)).toEqual(SECTION_ORDER);
    expect(list.slice(SECTION_ORDER.length)).toEqual([
      { id: 'custom:a', label: 'Urgent' },
      { id: 'custom:b', label: 'org:foo' },
      { id: 'custom:c', label: 'Empty query' },
    ]);
  });

  it('pollTargets uses the section id / custom query as filter and skips empty queries', () => {
    const targets = pollTargets(withCustom);
    expect(targets.find((t) => t.id === 'review-requested')?.filter).toBe('review-requested');
    expect(targets.find((t) => t.id === 'custom:a')).toEqual({
      id: 'custom:a',
      label: 'Urgent',
      filter: 'label:urgent',
    });
    expect(targets.find((t) => t.id === 'custom:c')).toBeUndefined();
  });

  it('sectionOrderIndex orders known sections first, customs next, unknowns last', () => {
    expect(sectionOrderIndex('review-requested', withCustom)).toBe(0);
    expect(sectionOrderIndex('custom:a', withCustom)).toBe(SECTION_ORDER.length);
    expect(sectionOrderIndex('custom:b', withCustom)).toBe(SECTION_ORDER.length + 1);
    expect(sectionOrderIndex('never-heard-of-it', withCustom)).toBeGreaterThan(
      sectionOrderIndex('custom:c', withCustom),
    );
  });

  it('activeSyncGroups drops empty-name and empty-section groups', () => {
    const s = mergeSettings({
      syncGroups: [
        { id: 'g1', name: 'Active', sectionIds: ['review-requested'] },
        { id: 'g2', name: '', sectionIds: ['review-requested'] },
        { id: 'g3', name: 'No sections', sectionIds: [] },
      ],
    });
    expect(activeSyncGroups(s).map((g) => g.id)).toEqual(['g1']);
  });
});

describe('inbox section visibility & order', () => {
  const withCustom = mergeSettings({
    customSections: [
      { id: 'custom:a', name: 'Urgent', query: 'label:urgent' },
      { id: 'custom:b', name: 'Later', query: 'org:foo' },
    ],
  });

  it('inboxOrderIndex honors explicit order, then falls back to canonical order', () => {
    const s = mergeSettings({
      ...withCustom,
      inboxOrder: ['your-drafts', 'review-requested'],
    });
    expect(inboxOrderIndex('your-drafts', s)).toBe(0);
    expect(inboxOrderIndex('review-requested', s)).toBe(1);
    // 未列挙の既知セクションは明示ブロックの後ろ
    expect(inboxOrderIndex('needs-action', s)).toBeGreaterThan(1);
    // 未知スラッグは最大（末尾）
    expect(inboxOrderIndex('never-heard-of-it', s)).toBeGreaterThan(inboxOrderIndex('custom:b', s));
  });

  it('isSectionHidden is true only for ids in hiddenSections', () => {
    const s = mergeSettings({ hiddenSections: ['your-drafts'] });
    expect(isSectionHidden('your-drafts', s)).toBe(true);
    expect(isSectionHidden('review-requested', s)).toBe(false);
  });

  it('orderedInboxSections lists every section, reordered, with hidden flags', () => {
    const s = mergeSettings({
      ...withCustom,
      inboxOrder: ['custom:a', 'review-requested'],
      hiddenSections: ['review-requested'],
    });
    const rows = orderedInboxSections(s);
    expect(rows.length).toBe(listSections(s).length);
    // 明示順が先頭
    expect(rows[0]).toEqual({ id: 'custom:a', label: 'Urgent', hidden: false });
    expect(rows[1]).toEqual({ id: 'review-requested', label: 'Needs your review', hidden: true });
    // 両配列に無い custom は可視のまま、明示ブロックの後ろに並ぶ
    const bIndex = rows.findIndex((r) => r.id === 'custom:b');
    expect(rows[bIndex]?.hidden).toBe(false);
    expect(bIndex).toBeGreaterThan(1);
  });
});
