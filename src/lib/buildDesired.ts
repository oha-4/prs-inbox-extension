import type { InboxSection, PullRequest, Settings } from '../types';
import type { DesiredTab } from './diff';
import { filterSections } from './filters';
import { makePlaceholderUrl, placeholderPrId } from './placeholder';
import { activeSyncGroups } from './settings';
import { sortPrs } from './sortPrs';

export interface DesiredPlan {
  desired: DesiredTab[];
  /** SyncGroup.id -> ソート済みのprId列（タブ並べ替えに使用） */
  orderByGroup: Map<string, string[]>;
}

/**
 * snapshot と設定から desired なタブ集合を構築する（純粋、chrome.* なし）。
 *
 * グループごとに所属セクションの PR を合流させ、グループ内でのみ重複排除する
 * （同じセクション / 同じ PR が複数グループに現れれば、グループごとに1エントリ）。
 * セクションの走査順は sectionIds の並び（＝ユーザーが設定で追加・並べ替えた順）。
 * sortCriteria が空のときはこの合流順をそのまま表示順にする（sortPrs は
 * 空指定でもPR番号で並べ替えてしまうため呼ばない）。
 *
 * keepEmptyGroups: PRが0件の active グループにはプレースホルダを1枚積む。
 * orderByGroup への空登録は必須（Phase 0a のグループ養子縁組がキーを見る。
 * 並べ替えは <2 でスキップ）。
 */
export function buildDesired(sections: InboxSection[], settings: Settings): DesiredPlan {
  const filtered = filterSections(sections, settings.allowlist, settings.blocklist);
  const prsBySection = new Map(filtered.map((s) => [s.id, s.prs]));

  const desired: DesiredTab[] = [];
  const orderByGroup = new Map<string, string[]>();
  for (const group of activeSyncGroups(settings)) {
    const seen = new Set<string>();
    const prs: PullRequest[] = [];
    for (const sectionId of group.sectionIds) {
      for (const pr of prsBySection.get(sectionId) ?? []) {
        if (seen.has(pr.id)) continue;
        seen.add(pr.id);
        prs.push(pr);
      }
    }

    if (prs.length === 0) {
      if (settings.keepEmptyGroups) {
        desired.push({
          prId: placeholderPrId(group.id),
          url: makePlaceholderUrl(group.id, group.name),
          groupId: group.id,
          groupTitle: group.name,
        });
        orderByGroup.set(group.id, []);
      }
      continue;
    }

    const ordered = settings.sortCriteria.length > 0 ? sortPrs(prs, settings.sortCriteria) : prs;
    const ids: string[] = [];
    for (const pr of ordered) {
      desired.push({ prId: pr.id, url: pr.url, groupId: group.id, groupTitle: group.name });
      ids.push(pr.id);
    }
    orderByGroup.set(group.id, ids);
  }
  return { desired, orderByGroup };
}
