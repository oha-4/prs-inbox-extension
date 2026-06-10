import { useEffect, useState } from 'react';
import type { InboxSnapshot } from '../../types';
import { loadSnapshot, STORAGE_KEYS } from '../../storage';
import { sendMessage } from '../../messages';

export function useSnapshot(): { snapshot: InboxSnapshot | null; refreshing: boolean; refresh: () => void } {
  const [snapshot, setSnapshot] = useState<InboxSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void loadSnapshot().then(setSnapshot);
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ): void => {
      if (area === 'local' && changes[STORAGE_KEYS.snapshot]) {
        setSnapshot((changes[STORAGE_KEYS.snapshot]!.newValue as InboxSnapshot) ?? null);
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  // popupを開いたら裏で最新化
  useEffect(() => {
    void sendMessage({ type: 'REFRESH' });
  }, []);

  const refresh = (): void => {
    setRefreshing(true);
    void sendMessage({ type: 'REFRESH' }).finally(() => setRefreshing(false));
  };

  return { snapshot, refreshing, refresh };
}
