import type { Msg, MsgResponse } from '../types';
import { settingsChangeTargets } from '../lib/settingsChange';
import { loadSettings, STORAGE_KEYS } from '../storage';
import { applySettingsChange, runDebugDump, runPoll } from './poll';
import { syncTabs } from './tabSync';

const POLL_ALARM = 'poll';
const MANUAL_REFRESH_DEBOUNCE_MS = 10_000;

// SW再起動でリセットされるが、デバウンス用途では十分
let lastPollStartedAt = 0;

async function ensureAlarm(): Promise<void> {
  const settings = await loadSettings();
  const period = Math.max(1, settings.pollIntervalMinutes);
  const existing = await chrome.alarms.get(POLL_ALARM);
  if (existing?.periodInMinutes === period) return;
  await chrome.alarms.create(POLL_ALARM, { periodInMinutes: period, delayInMinutes: period });
}

function poll(): void {
  lastPollStartedAt = Date.now();
  void runPoll();
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureAlarm();
  poll();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureAlarm();
  poll();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) poll();
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'sync-now') return;
  // REFRESH と同じデバウンス窓に収める（poll() が lastPollStartedAt を更新）。
  // runPoll は実行中なら自前でスキップするので追加の直列化は不要。
  if (Date.now() - lastPollStartedAt < MANUAL_REFRESH_DEBOUNCE_MS) return;
  poll();
});

/**
 * 非同期ハンドラの promise を必ず sendResponse で締める。
 * reject を握り潰して `{ ok: false, error }` を返すことで、popup 側の
 * sendMessage の promise が応答チャネル閉鎖まで宙吊りになる（スピナーが
 * 回り続ける）のを防ぐ。undefined を resolve するハンドラは `{ ok: true }` に。
 */
function respondWith(work: Promise<unknown>, sendResponse: (r: MsgResponse) => void): void {
  work
    .then((r) => sendResponse((r as MsgResponse) ?? { ok: true }))
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
}

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  if (msg.type === 'REFRESH') {
    if (Date.now() - lastPollStartedAt < MANUAL_REFRESH_DEBOUNCE_MS) {
      sendResponse({ ok: true, skipped: true });
      return false;
    }
    lastPollStartedAt = Date.now();
    // 実行中の poll があれば runPoll は false を返す（skipped 応答形式に揃える）。
    // reject 時も respondWith が { ok: false } で必ず応答チャネルを締める。
    respondWith(
      runPoll().then((ran) => ({ ok: true, skipped: !ran })),
      sendResponse,
    );
    return true;
  }
  if (msg.type === 'SYNC_TABS_NOW') {
    respondWith(syncTabs(), sendResponse);
    return true;
  }
  if (msg.type === 'FORCE_SYNC') {
    respondWith(syncTabs(true), sendResponse);
    return true;
  }
  if (msg.type === 'DUMP_DEBUG') {
    respondWith(runDebugDump(), sendResponse);
    return true;
  }
  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  const change = changes[STORAGE_KEYS.settings];
  if (!change) return;
  // 変更キーに応じて必要な処理だけ走らせる（例: debugMode トグルで全タブ同期しない）
  const targets = settingsChangeTargets(change.oldValue, change.newValue);
  if (targets.alarm) void ensureAlarm();
  if (targets.badge || targets.tabSync) {
    void applySettingsChange({ badge: targets.badge, tabSync: targets.tabSync });
  }
});
