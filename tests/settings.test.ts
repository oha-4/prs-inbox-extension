import { describe, expect, it } from 'vitest';
import { defaultSettings, mergeSettings, SECTION_ORDER } from '../src/lib/settings';

describe('mergeSettings', () => {
  it('returns defaults for empty/invalid input', () => {
    expect(mergeSettings(undefined)).toEqual(defaultSettings());
    expect(mergeSettings(null)).toEqual(defaultSettings());
    expect(mergeSettings('junk')).toEqual(defaultSettings());
  });

  it('only review-requested is enabled by default', () => {
    const s = defaultSettings();
    for (const id of SECTION_ORDER) {
      expect(s.sections[id]!.enabled).toBe(id === 'review-requested');
    }
  });

  it('keeps stored overrides and fills missing fields', () => {
    const s = mergeSettings({
      pollIntervalMinutes: 10,
      sections: { 'your-drafts': { enabled: true, groupName: 'Drafts' } },
    });
    expect(s.pollIntervalMinutes).toBe(10);
    expect(s.maxPrAge).toBe('1m');
    expect(s.sections['your-drafts']).toMatchObject({
      enabled: true,
      groupName: 'Drafts',
      groupColor: 'yellow',
    });
    expect(s.sections['review-requested']!.enabled).toBe(true);
  });

  it('preserves unknown future sections from storage', () => {
    const s = mergeSettings({
      sections: { 'brand-new-section': { enabled: true, groupName: 'New', label: 'New stuff' } },
    });
    expect(s.sections['brand-new-section']).toMatchObject({ enabled: true, groupName: 'New' });
  });

  it('rejects invalid interval values', () => {
    expect(mergeSettings({ pollIntervalMinutes: 0 }).pollIntervalMinutes).toBe(5);
    expect(mergeSettings({ pollIntervalMinutes: -3 }).pollIntervalMinutes).toBe(5);
  });

  it('defaults badgeIncludeTeamReview off and respects the stored value', () => {
    expect(defaultSettings().badgeIncludeTeamReview).toBe(false);
    expect(mergeSettings({ badgeIncludeTeamReview: true }).badgeIncludeTeamReview).toBe(true);
  });
});
