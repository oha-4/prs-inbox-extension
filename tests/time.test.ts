import { describe, expect, it } from 'vitest';
import { formatRelative } from '../src/lib/time';

// 固定した now を基準に、iso を「now から n 秒前」に置く
const NOW = Date.parse('2026-07-11T00:00:00Z');
const agoSeconds = (s: number): string => new Date(NOW - s * 1000).toISOString();

describe('formatRelative', () => {
  it('returns "now" under 60 seconds and "1m" at exactly 60 seconds', () => {
    expect(formatRelative(agoSeconds(0), NOW)).toBe('now');
    expect(formatRelative(agoSeconds(59), NOW)).toBe('now');
    expect(formatRelative(agoSeconds(60), NOW)).toBe('1m');
  });

  it('rolls over each unit boundary (minute/hour/day/month/year)', () => {
    expect(formatRelative(agoSeconds(60 * 59), NOW)).toBe('59m');
    expect(formatRelative(agoSeconds(3600), NOW)).toBe('1h');
    expect(formatRelative(agoSeconds(3600 * 23), NOW)).toBe('23h');
    expect(formatRelative(agoSeconds(24 * 3600), NOW)).toBe('1d');
    // 月=30日・年=365日の近似
    expect(formatRelative(agoSeconds(29 * 24 * 3600), NOW)).toBe('29d');
    expect(formatRelative(agoSeconds(30 * 24 * 3600), NOW)).toBe('1mo');
    expect(formatRelative(agoSeconds(364 * 24 * 3600), NOW)).toBe('12mo');
    expect(formatRelative(agoSeconds(365 * 24 * 3600), NOW)).toBe('1y');
    expect(formatRelative(agoSeconds(2 * 365 * 24 * 3600), NOW)).toBe('2y');
  });

  it('returns null for an invalid date string', () => {
    expect(formatRelative('not-a-date', NOW)).toBeNull();
    expect(formatRelative('', NOW)).toBeNull();
  });

  it('clamps future timestamps to "now"', () => {
    expect(formatRelative(agoSeconds(-120), NOW)).toBe('now');
  });

  it('uses the injected now argument (deterministic)', () => {
    const iso = '2026-07-11T00:00:00Z';
    expect(formatRelative(iso, Date.parse('2026-07-11T00:00:30Z'))).toBe('now');
    expect(formatRelative(iso, Date.parse('2026-07-11T02:00:00Z'))).toBe('2h');
  });
});
