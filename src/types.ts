export type PrState = 'OPEN' | 'MERGED' | 'CLOSED';

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  url: string;
  repoNameWithOwner: string;
  authorLogin: string;
  state: PrState;
  isDraft: boolean;
  commentCount: number;
  isReadByCurrentUser: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * /pulls/inbox/queries の filter スラッグ。
 * 既知: review-requested | team-review-requested | needs-action | waiting-for-review
 *     | your-drafts | ready-to-merge | merge-queue
 * GitHub側の追加に備えて string のまま扱う。
 */
export type SectionId = string;

export interface InboxSection {
  id: SectionId;
  label: string;
  prs: PullRequest[];
  /** ページ上限で打ち切った場合 true */
  truncated?: boolean;
}

export type AuthState = 'ok' | 'logged_out' | 'rate_limited' | 'error';

export interface InboxSnapshot {
  fetchedAt: number;
  /** フィルタ未適用の生データ。表示・同期時に filters を適用する */
  sections: InboxSection[];
  authState: AuthState;
  errorDetail?: string;
}

/**
 * ユーザー定義の同期グループ。1グループ = 1つの Chrome タブグループ。
 * id は生成後不変（UIで crypto.randomUUID()、既定グループのみ固定 'default'）。
 * 色は設定しない — Chrome の自動割当とユーザーの手動変更に任せる。
 */
export interface SyncGroup {
  id: string;
  /** Chrome タブグループの title。空は編集途中とみなし同期対象外 */
  name: string;
  /** KNOWN_SECTIONS のスラッグ or CustomSection.id。同じセクションを複数グループに入れてよい */
  sectionIds: string[];
}

/** GitHub 検索構文で /pulls/inbox/queries を叩くカスタムセクション。id は 'custom:<uuid>' */
export interface CustomSection {
  id: string;
  /** popup セクション見出し（空なら query を表示） */
  name: string;
  /** filter パラメータに渡す検索構文 */
  query: string;
}

/** グループ内ソートのキー。最大2段まで順番に重ねる */
export type SortKey = 'repo' | 'created' | 'updated';
export type SortDir = 'asc' | 'desc';
export interface SortCriterion {
  key: SortKey;
  dir: SortDir;
}

export interface Settings {
  pollIntervalMinutes: number;
  /** /pulls/inbox/queries の max_pr_age（'1m' | '1y' を確認済み） */
  maxPrAge: string;
  autoCloseRemoved: boolean;
  /** ツールバーアイコンに件数バッジを表示するか（既定: 表示） */
  badgeEnabled: boolean;
  /** バッジ件数に team-review-requested も含めるか（既定: review-requested のみ） */
  badgeIncludeTeamReview: boolean;
  /** タブグループ内の並び順（先頭の条件が最優先の多段ソート） */
  sortCriteria: SortCriterion[];
  /** 更新時にタブグループを強制整列するか（既定: 通常同期） */
  forceAlignOnRefresh: boolean;
  /** PRが0件になった有効グループをプレースホルダタブ（Inbox Zeroページ）で維持し、位置を保つか（既定: off） */
  keepEmptyGroups: boolean;
  /** 同期グループ（同期対象はグループ所属で決まる。popup表示は下記2フィールドで制御） */
  syncGroups: SyncGroup[];
  customSections: CustomSection[];
  /**
   * popup 一覧で非表示にするセクションid（表示のみ。取得・バッジ・タブ同期には影響しない）。
   * 両配列に無いidは可視扱い（新規カスタム/未知スラッグが勝手に隠れない）。
   */
  hiddenSections: string[];
  /** popup 一覧のセクション表示順（全セクションidの明示順。未列挙は正準順で末尾）。表示のみ */
  inboxOrder: string[];
  /** 'owner' または 'owner/repo'。空なら全許可 */
  allowlist: string[];
  blocklist: string[];
  debugMode: boolean;
}

export interface OwnedTab {
  tabId: number;
  prId: string;
  prUrl: string;
  /** SyncGroup.id */
  groupId: string;
}

/** chrome.storage.session に保存（ブラウザ終了で消える＝タブ/グループIDの寿命と一致） */
export interface SyncState {
  ownedTabs: OwnedTab[];
  /**
   * SyncGroup.id → Chrome グループIDと最後に設定した title。
   * title を保持することで「設定側のリネーム」（chrome title === 保存 title）と
   * 「ユーザーの chrome 側リネーム」（不一致 → 所有権解放）を区別できる。
   */
  groups: Record<string, { chromeGroupId: number; title: string }>;
  backoffUntil?: number;
}

export interface DebugDump {
  url: string;
  status: number;
  body: unknown;
  at: number;
}

export type Msg =
  | { type: 'REFRESH' }
  | { type: 'SYNC_TABS_NOW' }
  | { type: 'FORCE_SYNC' }
  | { type: 'DUMP_DEBUG' };

/**
 * background の onMessage ハンドラが必ず返す応答形。
 * - 通常のコマンド: `{ ok: true }`（REFRESH のデバウンススキップは `skipped: true`）
 * - 失敗時: `{ ok: false, error }`（ハンドラ内の promise が reject してもこの形で返す）
 * - DUMP_DEBUG: `{ saved: number }`
 */
export type MsgResponse = { ok: boolean; skipped?: boolean; error?: string } | { saved: number };
