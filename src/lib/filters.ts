import type { InboxSection } from '../types';

/**
 * pattern が 'owner' なら owner 配下の全repoに一致、'owner/repo' なら完全一致。
 * 大文字小文字は無視。
 */
export function matchesPattern(repoNameWithOwner: string, pattern: string): boolean {
  const repo = repoNameWithOwner.toLowerCase();
  const p = pattern.trim().toLowerCase();
  if (!p) return false;
  if (p.includes('/')) return repo === p;
  return repo.startsWith(`${p}/`);
}

export function passesFilters(
  repoNameWithOwner: string,
  allowlist: string[],
  blocklist: string[],
): boolean {
  if (blocklist.some((p) => matchesPattern(repoNameWithOwner, p))) return false;
  if (allowlist.length === 0) return true;
  return allowlist.some((p) => matchesPattern(repoNameWithOwner, p));
}

/** snapshot のセクション群に allowlist/blocklist を適用（popup表示・タブ同期で共用） */
export function filterSections(
  sections: InboxSection[],
  allowlist: string[],
  blocklist: string[],
): InboxSection[] {
  return sections.map((s) => ({
    ...s,
    prs: s.prs.filter((pr) => passesFilters(pr.repoNameWithOwner, allowlist, blocklist)),
  }));
}
