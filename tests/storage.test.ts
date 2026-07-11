import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBackoffUntil, loadSyncState, saveBackoffUntil, saveSyncState } from '../src/storage';

// chrome.storage.session を in-memory でスタブ
const session = new Map<string, unknown>();
vi.stubGlobal('chrome', {
  storage: {
    session: {
      get: async (key: string) => ({ [key]: session.get(key) }),
      set: async (obj: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(obj)) session.set(k, v);
      },
    },
  },
});

beforeEach(() => session.clear());

describe('backoffUntil is stored separately from syncState', () => {
  it('saveSyncState does not clobber a previously set backoffUntil', async () => {
    await saveBackoffUntil(12345);
    // tabSync 完了時の書き込みを模倣（開始時点の SyncState をそのまま保存）
    await saveSyncState({ ownedTabs: [], groups: {} });

    expect(await loadBackoffUntil()).toBe(12345);
    const state = await loadSyncState();
    expect(state).toEqual({ ownedTabs: [], groups: {} });
    // 旧フィールドが SyncState に混入していないこと
    expect('backoffUntil' in state).toBe(false);
  });

  it('loadBackoffUntil returns undefined when unset or non-numeric', async () => {
    expect(await loadBackoffUntil()).toBeUndefined();
    await saveBackoffUntil(999);
    expect(await loadBackoffUntil()).toBe(999);
  });
});
