import type { InboxSection, Settings } from '../types';

/** バッジ表示上限。これを超えると `"999+"` に丸める(バッジは4文字程度で切れるため) */
export const BADGE_MAX = 999;

/**
 * バッジに出す件数文字列を組み立てる pure 関数。
 *
 * 対象は「Needs your review」(`review-requested`)、設定で
 * `badgeIncludeTeamReview` が有効なら「チームのレビュー」
 * (`team-review-requested`)も含める。
 *
 * 打ち切り(`section.truncated`)が起きた対象セクションを含む場合、
 * 実件数より少ない可能性があるため `"N+"` と `+` サフィックスを付ける。
 * また `count > BADGE_MAX` の場合は `"999+"` に丸める。
 * 0 件のときは空文字(バッジ非表示)。
 *
 * @param sections フィルタ適用後のセクション配列
 */
export function badgeText(sections: InboxSection[], settings: Settings): string {
  const ids = new Set<string>(['review-requested']);
  if (settings.badgeIncludeTeamReview) ids.add('team-review-requested');

  const targets = sections.filter((s) => ids.has(s.id));
  const count = targets.reduce((sum, s) => sum + s.prs.length, 0);
  if (count <= 0) return '';

  const truncated = targets.some((s) => s.truncated === true);
  if (count > BADGE_MAX) return `${BADGE_MAX}+`;
  return truncated ? `${count}+` : String(count);
}
