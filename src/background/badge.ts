import type { InboxSnapshot, Settings } from '../types';
import { badgeText } from '../lib/badgeText';
import { filterSections } from '../lib/filters';

/** バッジには「Needs your review」(設定で「チームのレビュー」も)のフィルタ適用後件数を出す */
export async function updateBadge(
  snapshot: InboxSnapshot | null,
  settings: Settings,
): Promise<void> {
  let text = '';
  if (settings.badgeEnabled && snapshot && snapshot.authState === 'ok') {
    const sections = filterSections(snapshot.sections, settings.allowlist, settings.blocklist);
    text = badgeText(sections, settings);
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: '#29bf7e' });
  await chrome.action.setBadgeTextColor?.({ color: '#0a0b0e' });
}
