import { describe, expect, it } from 'vitest';
import { isSamePr, prUrlKey } from '../src/lib/prUrl';

describe('prUrlKey', () => {
  it('normalizes PR URLs including sub-pages and anchors', () => {
    const base = prUrlKey('https://github.com/acme/widgets/pull/152');
    expect(base).toBe('acme/widgets#152');
    expect(prUrlKey('https://github.com/acme/widgets/pull/152/files')).toBe(base);
    expect(prUrlKey('https://github.com/acme/widgets/pull/152#discussion_r1')).toBe(base);
    expect(prUrlKey('https://github.com/acme/widgets/pull/152?w=1')).toBe(base);
    expect(prUrlKey('https://github.com/ACME/Widgets/pull/152')).toBe(base);
  });

  it('returns null for non-PR URLs', () => {
    expect(prUrlKey('https://github.com/acme/widgets')).toBeNull();
    expect(prUrlKey('https://github.com/acme/widgets/issues/152')).toBeNull();
    expect(prUrlKey('https://github.com/pulls/inbox')).toBeNull();
    expect(prUrlKey('https://example.com/acme/widgets/pull/152')).toBeNull();
    expect(prUrlKey('chrome://newtab/')).toBeNull();
  });

  it('distinguishes different PR numbers', () => {
    expect(prUrlKey('https://github.com/acme/widgets/pull/1520')).not.toBe(
      prUrlKey('https://github.com/acme/widgets/pull/152'),
    );
  });
});

describe('isSamePr', () => {
  it('detects navigation away from the PR', () => {
    const prUrl = 'https://github.com/acme/widgets/pull/152';
    expect(isSamePr('https://github.com/acme/widgets/pull/152/files', prUrl)).toBe(true);
    expect(isSamePr('https://github.com/acme/widgets/pull/999', prUrl)).toBe(false);
    expect(isSamePr('https://github.com/acme/widgets', prUrl)).toBe(false);
    expect(isSamePr('chrome://newtab/', prUrl)).toBe(false);
  });
});
