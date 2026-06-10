import type { DebugDump, InboxSnapshot, Settings, SyncState } from './types';
import { mergeSettings } from './lib/settings';

const KEY_SETTINGS = 'settings';
const KEY_SNAPSHOT = 'snapshot';
const KEY_DEBUG_DUMP = 'debugDump';
const KEY_SYNC_STATE = 'syncState';

export async function loadSettings(): Promise<Settings> {
  const data = await chrome.storage.sync.get(KEY_SETTINGS);
  return mergeSettings(data[KEY_SETTINGS]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [KEY_SETTINGS]: settings });
}

export async function loadSnapshot(): Promise<InboxSnapshot | null> {
  const data = await chrome.storage.local.get(KEY_SNAPSHOT);
  return (data[KEY_SNAPSHOT] as InboxSnapshot | undefined) ?? null;
}

export async function saveSnapshot(snapshot: InboxSnapshot): Promise<void> {
  await chrome.storage.local.set({ [KEY_SNAPSHOT]: snapshot });
}

export async function saveDebugDump(dumps: DebugDump[]): Promise<void> {
  await chrome.storage.local.set({ [KEY_DEBUG_DUMP]: dumps });
}

export async function loadDebugDump(): Promise<DebugDump[]> {
  const data = await chrome.storage.local.get(KEY_DEBUG_DUMP);
  return (data[KEY_DEBUG_DUMP] as DebugDump[] | undefined) ?? [];
}

export async function loadSyncState(): Promise<SyncState> {
  const data = await chrome.storage.session.get(KEY_SYNC_STATE);
  return (data[KEY_SYNC_STATE] as SyncState | undefined) ?? { ownedTabs: [], groupIds: {} };
}

export async function saveSyncState(state: SyncState): Promise<void> {
  await chrome.storage.session.set({ [KEY_SYNC_STATE]: state });
}

export const STORAGE_KEYS = {
  settings: KEY_SETTINGS,
  snapshot: KEY_SNAPSHOT,
  debugDump: KEY_DEBUG_DUMP,
  syncState: KEY_SYNC_STATE,
} as const;
