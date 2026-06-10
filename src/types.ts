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

export type TabGroupColor =
  | 'grey'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'pink'
  | 'purple'
  | 'cyan'
  | 'orange';

export interface SectionSyncConfig {
  /** タブグループ同期の対象にするか（popup表示は常に全セクション） */
  enabled: boolean;
  label: string;
  groupName: string;
  groupColor: TabGroupColor;
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
  /** バッジ件数に team-review-requested も含めるか（既定: review-requested のみ） */
  badgeIncludeTeamReview: boolean;
  /** タブグループ内の並び順（先頭の条件が最優先の多段ソート） */
  sortCriteria: SortCriterion[];
  /** 更新時にタブグループを強制整列するか（既定: 通常同期） */
  forceAlignOnRefresh: boolean;
  sections: Record<SectionId, SectionSyncConfig>;
  /** 'owner' または 'owner/repo'。空なら全許可 */
  allowlist: string[];
  blocklist: string[];
  debugMode: boolean;
}

export interface OwnedTab {
  tabId: number;
  prId: string;
  prUrl: string;
  groupName: string;
}

/** chrome.storage.session に保存（ブラウザ終了で消える＝タブ/グループIDの寿命と一致） */
export interface SyncState {
  ownedTabs: OwnedTab[];
  groupIds: Record<string, number>;
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
