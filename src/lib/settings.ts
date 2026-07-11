import type {
  CustomSection,
  SectionId,
  Settings,
  SortCriterion,
  SortKey,
  SyncGroup,
} from '../types';

export const SORT_KEYS: SortKey[] = ['repo', 'created', 'updated'];
export const MAX_SORT_CRITERIA = 2;

/**
 * ポーリング間隔の許容範囲（分）。UI（SettingsView の number input の min/max）と
 * mergeSettings のバリデーションで共有する。範囲外・非整数は既定値へ矯正する。
 */
export const MIN_POLL_INTERVAL = 1;
export const MAX_POLL_INTERVAL = 120;

/**
 * max_pr_age に許可する値（private API のクエリにそのまま載るため許可リストで縛る）。
 * UI（SettingsView の選択肢）と mergeSettings のバリデーションで共有する。
 * 先頭を既定値とする。
 */
export const MAX_PR_AGE_VALUES = ['1m', '1y'] as const;
export type MaxPrAge = (typeof MAX_PR_AGE_VALUES)[number];

/** storage.sync の 8KB/item 制限に対する防御（エラーではなく黙って切り詰める） */
export const MAX_SYNC_GROUPS = 20;
export const MAX_CUSTOM_SECTIONS = 20;

/** 既知/将来の GitHub スラッグと衝突しないための必須プレフィックス */
export const CUSTOM_SECTION_PREFIX = 'custom:';

/** 既定: repo順 → 作成が古い順 */
const DEFAULT_SORT: SortCriterion[] = [
  { key: 'repo', dir: 'asc' },
  { key: 'created', dir: 'asc' },
];

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

export function defaultSettings(): Settings {
  return {
    pollIntervalMinutes: 5,
    maxPrAge: MAX_PR_AGE_VALUES[0],
    autoCloseRemoved: true,
    badgeEnabled: true,
    badgeIncludeTeamReview: false,
    sortCriteria: DEFAULT_SORT.map((c) => ({ ...c })),
    forceAlignOnRefresh: false,
    keepEmptyGroups: false,
    // id は固定文字列。ここで randomUUID() を呼ぶと読み込みごとに別IDになり
    // 所有権（SyncState.groups のキー）が壊れる。
    syncGroups: [{ id: 'default', name: 'Needs review', sectionIds: ['review-requested'] }],
    customSections: [],
    hiddenSections: [],
    inboxOrder: [],
    allowlist: [],
    blocklist: [],
    debugMode: false,
  };
}

/** popup 表示・グループ割当 UI 用のセクション一覧（既知セクション → custom の正準順） */
export function listSections(settings: Settings): { id: string; label: string }[] {
  return [
    ...KNOWN_SECTIONS.map((s) => ({ id: s.id, label: s.label })),
    ...settings.customSections.map((ci) => ({ id: ci.id, label: ci.name.trim() || ci.query })),
  ];
}

/** poll が叩く対象。custom は query が filter になる（空 query は除外） */
export function pollTargets(settings: Settings): { id: string; label: string; filter: string }[] {
  return [
    ...KNOWN_SECTIONS.map((s) => ({ id: s.id, label: s.label, filter: s.id })),
    ...settings.customSections
      .filter((ci) => ci.query.trim().length > 0)
      .map((ci) => ({ id: ci.id, label: ci.name.trim() || ci.query, filter: ci.query })),
  ];
}

/** snapshot セクションの表示順: 既知 → SECTION_ORDER 順、custom → 定義順、未知 → 末尾 */
export function sectionOrderIndex(id: string, settings: Settings): number {
  const known = SECTION_ORDER.indexOf(id);
  if (known !== -1) return known;
  const custom = settings.customSections.findIndex((ci) => ci.id === id);
  if (custom !== -1) return SECTION_ORDER.length + custom;
  return SECTION_ORDER.length + settings.customSections.length;
}

/**
 * popup 一覧の表示順: inboxOrder に明示されていればその順、無ければ正準順
 * （sectionOrderIndex）で inboxOrder の後ろに並べる。
 */
export function inboxOrderIndex(id: string, settings: Settings): number {
  const i = settings.inboxOrder.indexOf(id);
  if (i !== -1) return i;
  return settings.inboxOrder.length + sectionOrderIndex(id, settings);
}

/** popup で非表示にするセクションか */
export function isSectionHidden(id: string, settings: Settings): boolean {
  return settings.hiddenSections.includes(id);
}

/**
 * 設定UI用: 既知 + custom の全セクションを popup 実効順で返す（hidden フラグ付き）。
 * 並べ替え・表示トグルの行リストとして使う。
 */
export function orderedInboxSections(
  settings: Settings,
): { id: string; label: string; hidden: boolean }[] {
  return [...listSections(settings)]
    .sort((a, b) => inboxOrderIndex(a.id, settings) - inboxOrderIndex(b.id, settings))
    .map((s) => ({ ...s, hidden: isSectionHidden(s.id, settings) }));
}

/**
 * 同期対象のグループ。name が空だと tabGroups.query({title: ''}) が
 * ユーザーの無題グループを誤採用するため、name 非空 && sectionIds 非空のみ。
 */
export function activeSyncGroups(settings: Settings): SyncGroup[] {
  return settings.syncGroups.filter((g) => g.name.trim().length > 0 && g.sectionIds.length > 0);
}

/** storage から読んだ部分的な設定をデフォルトとマージ（スキーマ進化に耐える） */
export function mergeSettings(stored: unknown): Settings {
  const base = defaultSettings();
  if (typeof stored !== 'object' || stored === null) return base;
  const s = stored as Partial<Settings>;
  return {
    ...base,
    ...(isValidPollInterval(s.pollIntervalMinutes)
      ? { pollIntervalMinutes: s.pollIntervalMinutes }
      : {}),
    ...(isKnownMaxPrAge(s.maxPrAge) ? { maxPrAge: s.maxPrAge } : {}),
    ...(typeof s.autoCloseRemoved === 'boolean' ? { autoCloseRemoved: s.autoCloseRemoved } : {}),
    ...(typeof s.badgeEnabled === 'boolean' ? { badgeEnabled: s.badgeEnabled } : {}),
    ...(typeof s.badgeIncludeTeamReview === 'boolean'
      ? { badgeIncludeTeamReview: s.badgeIncludeTeamReview }
      : {}),
    ...(typeof s.forceAlignOnRefresh === 'boolean'
      ? { forceAlignOnRefresh: s.forceAlignOnRefresh }
      : {}),
    ...(typeof s.keepEmptyGroups === 'boolean' ? { keepEmptyGroups: s.keepEmptyGroups } : {}),
    ...(Array.isArray(s.sortCriteria) ? { sortCriteria: sanitizeSort(s.sortCriteria) } : {}),
    ...(Array.isArray(s.syncGroups) ? { syncGroups: sanitizeSyncGroups(s.syncGroups) } : {}),
    ...(Array.isArray(s.customSections)
      ? { customSections: sanitizeCustomSections(s.customSections) }
      : {}),
    ...(Array.isArray(s.hiddenSections)
      ? { hiddenSections: sanitizeIdList(s.hiddenSections) }
      : {}),
    ...(Array.isArray(s.inboxOrder) ? { inboxOrder: sanitizeIdList(s.inboxOrder) } : {}),
    ...(Array.isArray(s.allowlist) ? { allowlist: s.allowlist.filter(isNonEmptyString) } : {}),
    ...(Array.isArray(s.blocklist) ? { blocklist: s.blocklist.filter(isNonEmptyString) } : {}),
    ...(typeof s.debugMode === 'boolean' ? { debugMode: s.debugMode } : {}),
  };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * ポーリング間隔として有効か。整数かつ [MIN_POLL_INTERVAL, MAX_POLL_INTERVAL]。
 * 非整数（1.5）・範囲外（0, 1e9）は不正 → 既定値へフォールバック。
 */
function isValidPollInterval(v: unknown): v is number {
  return (
    typeof v === 'number' && Number.isInteger(v) && v >= MIN_POLL_INTERVAL && v <= MAX_POLL_INTERVAL
  );
}

/** max_pr_age が既知値か（許可リスト照合）。未知値は既定値へフォールバック */
function isKnownMaxPrAge(v: unknown): v is MaxPrAge {
  return typeof v === 'string' && (MAX_PR_AGE_VALUES as readonly string[]).includes(v);
}

/** セクションid配列の検証: 非空文字のみ、重複除去（順序は保持） */
function sanitizeIdList(raw: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (!isNonEmptyString(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * 同期グループの検証。id 無しは skip（ここで再生成するとマージが非決定的になる）。
 * name は空を許容する（編集途中の状態がリロードで消えないように）。
 * 未知の sectionId は残す — 同期時に不活性なだけで、UI の削除ハンドラが参照掃除を担う。
 */
function sanitizeSyncGroups(raw: unknown[]): SyncGroup[] {
  const seen = new Set<string>();
  const out: SyncGroup[] = [];
  for (const item of raw) {
    if (out.length >= MAX_SYNC_GROUPS) break;
    if (typeof item !== 'object' || item === null) continue;
    const g = item as Partial<SyncGroup>;
    if (!isNonEmptyString(g.id) || seen.has(g.id)) continue;
    seen.add(g.id);
    const sectionSeen = new Set<string>();
    const sectionIds = (Array.isArray(g.sectionIds) ? g.sectionIds : []).filter(
      (id): id is string => {
        if (!isNonEmptyString(id) || sectionSeen.has(id)) return false;
        sectionSeen.add(id);
        return true;
      },
    );
    out.push({ id: g.id, name: typeof g.name === 'string' ? g.name.trim() : '', sectionIds });
  }
  return out;
}

/** カスタムセクションの検証。id は CUSTOM_SECTION_PREFIX 必須。name/query は空を許容 */
function sanitizeCustomSections(raw: unknown[]): CustomSection[] {
  const seen = new Set<string>();
  const out: CustomSection[] = [];
  for (const item of raw) {
    if (out.length >= MAX_CUSTOM_SECTIONS) break;
    if (typeof item !== 'object' || item === null) continue;
    const ci = item as Partial<CustomSection>;
    if (!isNonEmptyString(ci.id) || !ci.id.startsWith(CUSTOM_SECTION_PREFIX) || seen.has(ci.id)) {
      continue;
    }
    seen.add(ci.id);
    out.push({
      id: ci.id,
      name: typeof ci.name === 'string' ? ci.name.trim() : '',
      query: typeof ci.query === 'string' ? ci.query.trim() : '',
    });
  }
  return out;
}

/** 保存済みソート設定を検証（未知キー・重複・不正方向を除去、最大2段） */
function sanitizeSort(raw: unknown[]): SortCriterion[] {
  const seen = new Set<SortKey>();
  const out: SortCriterion[] = [];
  for (const item of raw) {
    if (out.length >= MAX_SORT_CRITERIA) break;
    if (typeof item !== 'object' || item === null) continue;
    const c = item as Partial<SortCriterion>;
    if (!SORT_KEYS.includes(c.key as SortKey) || seen.has(c.key as SortKey)) continue;
    seen.add(c.key as SortKey);
    out.push({ key: c.key as SortKey, dir: c.dir === 'desc' ? 'desc' : 'asc' });
  }
  return out;
}
