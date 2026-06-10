import { useCallback, useEffect, useState } from 'react';
import type { Settings } from '../../types';
import { loadSettings, saveSettings, STORAGE_KEYS } from '../../storage';
import { mergeSettings } from '../../lib/settings';

export function useSettings(): {
  settings: Settings | null;
  update: (mutate: (s: Settings) => Settings) => void;
} {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ): void => {
      if (area === 'sync' && changes[STORAGE_KEYS.settings]) {
        setSettings(mergeSettings(changes[STORAGE_KEYS.settings]!.newValue));
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const update = useCallback((mutate: (s: Settings) => Settings) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const next = mutate(prev);
      void saveSettings(next);
      return next;
    });
  }, []);

  return { settings, update };
}
