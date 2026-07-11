import type { ClickAction } from '../../lib/openPr';
import { findSyncedTab } from '../../lib/openPr';
import { loadSyncState } from '../../storage';

/**
 * PR 行クリックの副作用（タブ操作・popup を閉じる）を担う唯一の場所。
 * 純粋な判定（resolveClickAction）は src/lib/openPr.ts に、chrome.* を伴う実行は
 * ここに分離する。呼び出し側は解決済みの ClickAction を渡す。
 *
 * - foreground: 新規フォアグラウンドタブを開き popup を閉じる（既定挙動）。
 * - background: 常に active:false で開き popup は**閉じない**（連続 triage 用）。
 * - reuseSynced: 同期所有タブに同一PRがあればそれをアクティブ化して popup を閉じる。
 *   タブが既に消えている等で失敗したら新規フォアグラウンドタブへフォールバックし popup を閉じる。
 */
export async function openPr(pr: { url: string }, action: ClickAction): Promise<void> {
  if (action === 'background') {
    await chrome.tabs.create({ url: pr.url, active: false });
    return;
  }

  if (action === 'reuseSynced') {
    const { ownedTabs } = await loadSyncState();
    const owned = findSyncedTab(ownedTabs, pr.url);
    if (owned) {
      try {
        await chrome.tabs.update(owned.tabId, { active: true });
        const tab = await chrome.tabs.get(owned.tabId);
        if (typeof tab.windowId === 'number') {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
        window.close();
        return;
      } catch {
        // タブが既に消えている等 → 新規フォアグラウンドタブへフォールバック（下へ）
      }
    }
  }

  // foreground（reuseSynced のフォールバック含む）: 新規タブを開き popup を閉じる
  await chrome.tabs.create({ url: pr.url, active: true });
  window.close();
}
