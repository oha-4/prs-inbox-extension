import type { SectionId, SectionSyncConfig, Settings } from '../types';

export const KNOWN_SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'review-requested', label: 'Needs your review' },
  { id: 'team-review-requested', label: "Needs your team's review" },
  { id: 'needs-action', label: 'Needs action' },
  { id: 'waiting-for-review', label: 'Waiting for review' },
  { id: 'your-drafts', label: 'Your drafts' },
  { id: 'ready-to-merge', label: 'Ready to merge' },
  { id: 'merge-queue', label: 'Merge queue' },
];

export const SECTION_ORDER: SectionId[] = KNOWN_SECTIONS.map((s) => s.id);

function defaultSectionConfig(id: SectionId, label: string): SectionSyncConfig {
  return {
    enabled: id === 'review-requested',
    label,
    groupName: 'Needs review',
    groupColor: 'yellow',
  };
}

export function defaultSettings(): Settings {
  const sections: Record<SectionId, SectionSyncConfig> = {};
  for (const s of KNOWN_SECTIONS) sections[s.id] = defaultSectionConfig(s.id, s.label);
  return {
    pollIntervalMinutes: 5,
    maxPrAge: '1m',
    autoCloseRemoved: true,
    sections,
    allowlist: [],
    blocklist: [],
    debugMode: false,
  };
}

/** storage から読んだ部分的な設定をデフォルトとマージ（スキーマ進化に耐える） */
export function mergeSettings(stored: unknown): Settings {
  const base = defaultSettings();
  if (typeof stored !== 'object' || stored === null) return base;
  const s = stored as Partial<Settings>;
  const merged: Settings = {
    ...base,
    ...(typeof s.pollIntervalMinutes === 'number' && s.pollIntervalMinutes >= 1
      ? { pollIntervalMinutes: s.pollIntervalMinutes }
      : {}),
    ...(typeof s.maxPrAge === 'string' && s.maxPrAge ? { maxPrAge: s.maxPrAge } : {}),
    ...(typeof s.autoCloseRemoved === 'boolean' ? { autoCloseRemoved: s.autoCloseRemoved } : {}),
    ...(Array.isArray(s.allowlist) ? { allowlist: s.allowlist.filter(isNonEmptyString) } : {}),
    ...(Array.isArray(s.blocklist) ? { blocklist: s.blocklist.filter(isNonEmptyString) } : {}),
    ...(typeof s.debugMode === 'boolean' ? { debugMode: s.debugMode } : {}),
    sections: { ...base.sections },
  };
  if (typeof s.sections === 'object' && s.sections !== null) {
    for (const [id, cfg] of Object.entries(s.sections)) {
      const baseCfg = merged.sections[id] ?? defaultSectionConfig(id, id);
      if (typeof cfg !== 'object' || cfg === null) continue;
      merged.sections[id] = {
        enabled: typeof cfg.enabled === 'boolean' ? cfg.enabled : baseCfg.enabled,
        label: isNonEmptyString(cfg.label) ? cfg.label : baseCfg.label,
        groupName: isNonEmptyString(cfg.groupName) ? cfg.groupName : baseCfg.groupName,
        groupColor: isNonEmptyString(cfg.groupColor)
          ? (cfg.groupColor as SectionSyncConfig['groupColor'])
          : baseCfg.groupColor,
      };
    }
  }
  return merged;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}
