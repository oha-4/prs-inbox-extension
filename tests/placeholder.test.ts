import { describe, expect, it } from 'vitest';
import {
  isPlaceholderId,
  makePlaceholderUrl,
  PLACEHOLDER_URL_BASE,
  placeholderKey,
  placeholderPrId,
  tabKey,
} from '../src/lib/placeholder';

describe('makePlaceholderUrl / placeholderKey', () => {
  it('round-trips group names through the URL fragment', () => {
    const names = [
      'Needs review',
      'A&B=C#D',
      '日本語 グループ',
      '🎉 zero',
      'a+b',
      '100%',
      'trailing ',
    ];
    for (const name of names) {
      expect(placeholderKey(makePlaceholderUrl(name))).toBe(placeholderPrId(name));
    }
  });

  it('tolerates a missing trailing slash', () => {
    expect(placeholderKey('https://oha-4.github.io/prs-inbox-extension/inbox-zero#group=G')).toBe(
      placeholderPrId('G'),
    );
  });

  it('returns null for non-placeholder URLs', () => {
    expect(placeholderKey('https://github.com/acme/widgets/pull/1')).toBeNull();
    expect(placeholderKey('https://oha-4.github.io/prs-inbox-extension/')).toBeNull();
    expect(placeholderKey('https://oha-4.github.io/other/inbox-zero/#group=G')).toBeNull();
    expect(
      placeholderKey('https://example.com/prs-inbox-extension/inbox-zero/#group=G'),
    ).toBeNull();
    expect(placeholderKey('not a url')).toBeNull();
    expect(placeholderKey('')).toBeNull();
  });

  it('returns null when the group param is missing or empty', () => {
    expect(placeholderKey(PLACEHOLDER_URL_BASE)).toBeNull();
    expect(placeholderKey(`${PLACEHOLDER_URL_BASE}#`)).toBeNull();
    expect(placeholderKey(`${PLACEHOLDER_URL_BASE}#group=`)).toBeNull();
    expect(placeholderKey(`${PLACEHOLDER_URL_BASE}#other=x`)).toBeNull();
  });
});

describe('tabKey', () => {
  it('uses the PR key for PR URLs', () => {
    expect(tabKey('https://github.com/Acme/Widgets/pull/7/files')).toBe('acme/widgets#7');
  });

  it('uses the placeholder key for placeholder URLs', () => {
    expect(tabKey(makePlaceholderUrl('Needs review'))).toBe(placeholderPrId('Needs review'));
  });

  it('returns null for anything else', () => {
    expect(tabKey('https://example.com/')).toBeNull();
    expect(tabKey('')).toBeNull();
  });
});

describe('isPlaceholderId', () => {
  it('detects placeholder prIds and nothing else', () => {
    expect(isPlaceholderId(placeholderPrId('G'))).toBe(true);
    expect(isPlaceholderId('PR_kwDOAbc123')).toBe(false);
    expect(isPlaceholderId('')).toBe(false);
  });
});
