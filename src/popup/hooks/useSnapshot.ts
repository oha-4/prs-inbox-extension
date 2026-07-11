import { useCallback, useEffect, useRef, useState } from 'react';
import type { InboxSnapshot } from '../../types';
import { loadSnapshot, STORAGE_KEYS } from '../../storage';
import { sendMessage } from '../../messages';

export function useSnapshot(): {
  snapshot: InboxSnapshot | null;
  refreshing: boolean;
  refresh: () => void;
} {
  const [snapshot, setSnapshot] = useState<InboxSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 並行するREFRESH（mount時の自動更新 / 手動refresh）を参照カウントで束ねる。
  // booleanだと先に終わった側がスピナーを止めてしまうため、
  // 未完了が0になった時だけ止める。
  const pending = useRef(0);
  const track = useCallback((p: Promise<unknown>): void => {
    pending.current += 1;
    setRefreshing(true);
    void p.finally(() => {
      pending.current -= 1;
      if (pending.current === 0) setRefreshing(false);
    });
  }, []);

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

  const refresh = (): void => {
    track(sendMessage({ type: 'REFRESH' }));
  };

  // popupを開いたら裏で最新化（アイコンも回す）
  useEffect(() => {
    track(sendMessage({ type: 'REFRESH' }));
  }, [track]);

  return { snapshot, refreshing, refresh };
}
