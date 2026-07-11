import type { Msg } from '../types';
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

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  if (msg.type === 'REFRESH') {
    if (Date.now() - lastPollStartedAt < MANUAL_REFRESH_DEBOUNCE_MS) {
      sendResponse({ ok: true, skipped: true });
      return false;
    }
    lastPollStartedAt = Date.now();
    // 実行中の poll があれば runPoll は false を返す（skipped 応答形式に揃える）
    void runPoll().then((ran) => sendResponse({ ok: true, skipped: !ran }));
    return true;
  }
  if (msg.type === 'SYNC_TABS_NOW') {
    void syncTabs().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'FORCE_SYNC') {
    void syncTabs(true).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'DUMP_DEBUG') {
    void runDebugDump().then((r) => sendResponse(r));
    return true;
  }
  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[STORAGE_KEYS.settings]) {
    void ensureAlarm();
    void applySettingsChange();
  }
});
