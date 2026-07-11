import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../src/lib/settings';
import {
  classifySaveError,
  estimateSettingsBytes,
  isNearQuota,
  QUOTA_BYTES_PER_ITEM,
  QUOTA_WARN_BYTES,
  SAVE_DEBOUNCE_MS,
} from '../src/lib/settingsSave';

describe('estimateSettingsBytes', () => {
  it('counts the UTF-8 byte length of the serialized settings', () => {
    const s = defaultSettings();
    expect(estimateSettingsBytes(s)).toBe(new TextEncoder().encode(JSON.stringify(s)).length);
  });

  it('grows with large free-text lists', () => {
    const small = defaultSettings();
    const big = { ...small, blocklist: Array.from({ length: 500 }, (_, i) => `org-${i}/repo`) };
    expect(estimateSettingsBytes(big)).toBeGreaterThan(estimateSettingsBytes(small));
  });
});

describe('isNearQuota', () => {
  it('is false for default settings', () => {
    expect(isNearQuota(defaultSettings())).toBe(false);
  });

  it('is true once the estimate crosses the warn threshold', () => {
    const line = 'my-org/some-really-long-repo-name-padding';
    const rows = Math.ceil(QUOTA_WARN_BYTES / (line.length + 4));
    const big = {
      ...defaultSettings(),
      blocklist: Array.from({ length: rows }, () => line),
    };
    expect(estimateSettingsBytes(big)).toBeGreaterThanOrEqual(QUOTA_WARN_BYTES);
    expect(isNearQuota(big)).toBe(true);
  });

  it('keeps the warn threshold below the hard per-item limit', () => {
    expect(QUOTA_WARN_BYTES).toBeLessThan(QUOTA_BYTES_PER_ITEM);
  });
});

describe('classifySaveError', () => {
  it('maps per-item quota rejections to the quota key', () => {
    expect(classifySaveError(new Error('QUOTA_BYTES_PER_ITEM quota exceeded'))).toBe(
      'saveErrorQuota',
    );
  });

  it('maps write-rate rejections to the quota key', () => {
    expect(classifySaveError(new Error('MAX_WRITE_OPERATIONS_PER_MINUTE quota exceeded'))).toBe(
      'saveErrorQuota',
    );
  });

  it('accepts string and object-shaped errors', () => {
    expect(classifySaveError('QUOTA_BYTES quota exceeded')).toBe('saveErrorQuota');
    expect(classifySaveError({ message: 'value too large' })).toBe('saveErrorQuota');
  });

  it('falls back to the generic key for unknown errors', () => {
    expect(classifySaveError(new Error('network down'))).toBe('saveErrorGeneric');
    expect(classifySaveError(undefined)).toBe('saveErrorGeneric');
    expect(classifySaveError(null)).toBe('saveErrorGeneric');
  });
});

describe('SAVE_DEBOUNCE_MS', () => {
  it('is a short, conservative trailing window', () => {
    expect(SAVE_DEBOUNCE_MS).toBeGreaterThan(0);
    expect(SAVE_DEBOUNCE_MS).toBeLessThanOrEqual(1000);
  });
});
