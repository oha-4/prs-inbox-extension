import type { InboxSnapshot, Settings } from '../types';
import { filterSections } from '../lib/filters';

/** バッジには「Needs your review」のフィルタ適用後件数を出す */
export async function updateBadge(
  snapshot: InboxSnapshot | null,
  settings: Settings,
): Promise<void> {
  let text = '';
  if (snapshot && snapshot.authState === 'ok') {
    const sections = filterSections(snapshot.sections, settings.allowlist, settings.blocklist);
    const count = sections.find((s) => s.id === 'review-requested')?.prs.length ?? 0;
    text = count > 0 ? String(count) : '';
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: '#1f883d' });
}
