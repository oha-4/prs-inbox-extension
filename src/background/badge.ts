import type { InboxSnapshot, Settings } from '../types';
import { filterSections } from '../lib/filters';

/** バッジには「Needs your review」(設定で「チームのレビュー」も)のフィルタ適用後件数を出す */
export async function updateBadge(
  snapshot: InboxSnapshot | null,
  settings: Settings,
): Promise<void> {
  let text = '';
  if (settings.badgeEnabled && snapshot && snapshot.authState === 'ok') {
    const sections = filterSections(snapshot.sections, settings.allowlist, settings.blocklist);
    const ids = new Set<string>(['review-requested']);
    if (settings.badgeIncludeTeamReview) ids.add('team-review-requested');
    const count = sections.filter((s) => ids.has(s.id)).reduce((sum, s) => sum + s.prs.length, 0);
    text = count > 0 ? String(count) : '';
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: '#29bf7e' });
  await chrome.action.setBadgeTextColor?.({ color: '#0a0b0e' });
}
