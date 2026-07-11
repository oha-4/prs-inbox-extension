import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../src/lib/settings';
import { settingsChangeTargets } from '../src/lib/settingsChange';
import type { Settings } from '../src/types';

const base = (): Settings => defaultSettings();
const withKey = <K extends keyof Settings>(key: K, value: Settings[K]): Settings => ({
  ...base(),
  [key]: value,
});

describe('settingsChangeTargets', () => {
  it('no diff → nothing runs', () => {
    expect(settingsChangeTargets(base(), base())).toEqual({
      alarm: false,
      badge: false,
      tabSync: false,
    });
  });

  it('pollIntervalMinutes → alarm only', () => {
    expect(settingsChangeTargets(base(), withKey('pollIntervalMinutes', 15))).toEqual({
      alarm: true,
      badge: false,
      tabSync: false,
    });
  });

  it('badgeEnabled → badge only', () => {
    expect(settingsChangeTargets(base(), withKey('badgeEnabled', false))).toEqual({
      alarm: false,
      badge: true,
      tabSync: false,
    });
  });

  it('badgeIncludeTeamReview → badge only', () => {
    expect(settingsChangeTargets(base(), withKey('badgeIncludeTeamReview', true))).toEqual({
      alarm: false,
      badge: true,
      tabSync: false,
    });
  });

  it('debugMode toggle → nothing runs (no tab sync)', () => {
    expect(settingsChangeTargets(base(), withKey('debugMode', true))).toEqual({
      alarm: false,
      badge: false,
      tabSync: false,
    });
  });

  it('maxPrAge → nothing runs (only affects next poll request)', () => {
    expect(settingsChangeTargets(base(), withKey('maxPrAge', '1y'))).toEqual({
      alarm: false,
      badge: false,
      tabSync: false,
    });
  });

  it('display-only keys (hiddenSections / inboxOrder) → nothing runs', () => {
    expect(settingsChangeTargets(base(), withKey('hiddenSections', ['review-requested']))).toEqual({
      alarm: false,
      badge: false,
      tabSync: false,
    });
    expect(settingsChangeTargets(base(), withKey('inboxOrder', ['review-requested']))).toEqual({
      alarm: false,
      badge: false,
      tabSync: false,
    });
  });

  it.each<[keyof Settings, Settings[keyof Settings]]>([
    ['autoCloseRemoved', false],
    ['forceAlignOnRefresh', true],
    ['keepEmptyGroups', true],
    ['sortCriteria', [{ key: 'updated', dir: 'desc' }]],
    ['syncGroups', [{ id: 'g1', name: 'Reviews', sectionIds: ['review-requested'] }]],
    ['customSections', [{ id: 'custom:1', name: 'Mine', query: 'author:me' }]],
  ])('%s → tabSync only', (key, value) => {
    expect(settingsChangeTargets(base(), withKey(key, value))).toEqual({
      alarm: false,
      badge: false,
      tabSync: true,
    });
  });

  it('allowlist / blocklist → badge and tabSync (filters apply to both)', () => {
    expect(settingsChangeTargets(base(), withKey('allowlist', ['acme']))).toEqual({
      alarm: false,
      badge: true,
      tabSync: true,
    });
    expect(settingsChangeTargets(base(), withKey('blocklist', ['acme/spam']))).toEqual({
      alarm: false,
      badge: true,
      tabSync: true,
    });
  });

  it('multiple simultaneous changes union their targets', () => {
    const next: Settings = {
      ...base(),
      pollIntervalMinutes: 10,
      badgeEnabled: false,
      syncGroups: [{ id: 'g1', name: 'X', sectionIds: ['review-requested'] }],
    };
    expect(settingsChangeTargets(base(), next)).toEqual({
      alarm: true,
      badge: true,
      tabSync: true,
    });
  });

  it('normalizes via mergeSettings: undefined old value vs defaults → no diff', () => {
    // storage の初回書き込みで oldValue が undefined でも、値がデフォルトと同じなら何も走らない
    expect(settingsChangeTargets(undefined, base())).toEqual({
      alarm: false,
      badge: false,
      tabSync: false,
    });
  });

  it('every current Settings key is classified (no silent fallthrough today)', () => {
    // 表示のみで意図的に「何も走らない」キー。ここ以外のキーは変更時に
    // 必ず alarm/badge/tabSync のいずれかを立てること。分類漏れの早期検知。
    const displayOnly = new Set<keyof Settings>([
      'maxPrAge',
      'hiddenSections',
      'inboxOrder',
      'debugMode',
    ]);
    // 各キーを「確実に差分が出る」別値へ差し替えて判定する。
    const bumped: Record<keyof Settings, Settings[keyof Settings]> = {
      pollIntervalMinutes: 99,
      maxPrAge: '2y',
      autoCloseRemoved: false,
      badgeEnabled: false,
      badgeIncludeTeamReview: true,
      sortCriteria: [{ key: 'created', dir: 'desc' }],
      forceAlignOnRefresh: true,
      keepEmptyGroups: true,
      syncGroups: [{ id: 'zzz', name: 'Z', sectionIds: ['needs-action'] }],
      customSections: [{ id: 'custom:zzz', name: 'Z', query: 'is:open' }],
      hiddenSections: ['needs-action'],
      inboxOrder: ['needs-action'],
      allowlist: ['zzz-org'],
      blocklist: ['zzz-org/zzz'],
      debugMode: true,
    };
    for (const key of Object.keys(base()) as (keyof Settings)[]) {
      const targets = settingsChangeTargets(base(), withKey(key, bumped[key]));
      const anyRan = targets.alarm || targets.badge || targets.tabSync;
      if (displayOnly.has(key)) {
        expect(anyRan, `${key} should not trigger any work`).toBe(false);
      } else {
        expect(anyRan, `${key} should trigger some work`).toBe(true);
      }
    }
  });
});
