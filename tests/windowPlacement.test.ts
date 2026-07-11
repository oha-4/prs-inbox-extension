import { describe, expect, it } from 'vitest';
import { pickWindowId } from '../src/lib/windowPlacement';

describe('pickWindowId', () => {
  it('falls back to the last-focused window when there are no managed groups', () => {
    expect(pickWindowId([], 7)).toBe(7);
    expect(pickWindowId([], undefined)).toBeUndefined();
  });

  it('prefers the last-focused window if it hosts a managed group', () => {
    // window 2 has more groups, but the last-focused window 1 wins
    expect(pickWindowId([1, 2, 2], 1)).toBe(1);
  });

  it('picks the window with the most managed groups when last-focused has none', () => {
    expect(pickWindowId([1, 2, 2], 9)).toBe(2);
    expect(pickWindowId([1, 2, 2], undefined)).toBe(2);
  });

  it('breaks ties by insertion order (former behavior)', () => {
    expect(pickWindowId([1, 2], 9)).toBe(1);
    expect(pickWindowId([2, 1], 9)).toBe(2);
  });

  it('is unchanged in single-window operation', () => {
    // every managed group is in window 1; that window is chosen either way
    expect(pickWindowId([1, 1, 1], 1)).toBe(1);
    expect(pickWindowId([1, 1, 1], undefined)).toBe(1);
  });
});
