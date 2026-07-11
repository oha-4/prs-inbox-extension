import type { ClickBehavior } from '../../types';
import { findSyncedTab, resolveClickAction, syncedTabMatchesPr } from '../../lib/openPr';
import { loadSyncState } from '../../storage';

/**
 * PR 行クリックの副作用（タブ操作・popup を閉じる）を担う唯一の場所。
 * 純粋な判定は src/lib/openPr.ts に、chrome.* を伴う実行はここに分離する。
 *
 * - foreground: 新規フォアグラウンドタブを開き popup を閉じる（既定挙動）。
 * - background: 常に active:false で開き popup は**閉じない**（連続 triage 用）。
 * - reuseSynced: 同期所有タブに同一PRがあればそれをアクティブ化して popup を閉じる。
 *   タブが既に消えている等で失敗したら新規フォアグラウンドタブへフォールバックし popup を閉じる。
 */
export async function openPr(
  pr: { url: string },
  behavior: ClickBehavior,
  modified: boolean,
): Promise<void> {
  const action = resolveClickAction(behavior, modified);

  if (action === 'background') {
    await chrome.tabs.create({ url: pr.url, active: false });
    return;
  }

  if (action === 'reuseSynced') {
    const { ownedTabs } = await loadSyncState();
    const owned = findSyncedTab(ownedTabs, pr.url);
    if (owned) {
      let reused = false;
      try {
        // 保存時の prUrl ではなくタブの現在URLを照合してから前面化する。
        // 別ページへ手動遷移済み・取得失敗なら再利用せず新規タブへフォールバック（下へ）。
        const tab = await chrome.tabs.get(owned.tabId);
        if (syncedTabMatchesPr(tab.url ?? tab.pendingUrl, pr.url)) {
          await chrome.tabs.update(owned.tabId, { active: true });
          reused = true;
          // activate 成功後の focus 切替は失敗してもフォールバックに落とさない（二重タブ防止）。
          if (typeof tab.windowId === 'number') {
            try {
              await chrome.windows.update(tab.windowId, { focused: true });
            } catch {
              // ウィンドウのフォーカス切替失敗は無視（タブは既にアクティブ化済み）。
            }
          }
        }
      } catch {
        // タブが既に消えている等 → 新規フォアグラウンドタブへフォールバック（下へ）
      }
      if (reused) {
        window.close();
        return;
      }
    }
  }

  // foreground（reuseSynced のフォールバック含む）: 新規タブを開き popup を閉じる
  await chrome.tabs.create({ url: pr.url, active: true });
  window.close();
}
