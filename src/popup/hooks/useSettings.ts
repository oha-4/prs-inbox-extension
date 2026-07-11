import { useCallback, useEffect, useRef, useState } from 'react';
import type { Settings } from '../../types';
import { loadSettings, saveSettings, STORAGE_KEYS } from '../../storage';
import { mergeSettings } from '../../lib/settings';
import { classifySaveError, SAVE_DEBOUNCE_MS } from '../../lib/settingsSave';

export function useSettings(): {
  settings: Settings | null;
  update: (mutate: (s: Settings) => Settings) => void;
  saveError: string | null;
} {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // デバウンス保存中の最新値と timer。commit されるまで storage には書かない。
  const pendingRef = useRef<Settings | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // pending をまとめて storage へ書き出す。失敗時は実値を読み直して巻き戻す。
  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const next = pendingRef.current;
    if (next === null) return;
    pendingRef.current = null;
    void saveSettings(next).then(
      () => setSaveError(null),
      (err: unknown) => {
        setSaveError(classifySaveError(err));
        // UI とストレージの乖離を残さない: 実際に保存されている値へ巻き戻す。
        void loadSettings().then(setSettings);
      },
    );
  }, []);

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
    // popup が閉じる/隠れる直前に取りこぼしがないよう pending を確定させる。
    const onHide = (): void => flush();
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      chrome.storage.onChanged.removeListener(onChanged);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [flush]);

  const update = useCallback(
    (mutate: (s: Settings) => Settings) => {
      setSettings((prev) => {
        if (!prev) return prev;
        const next = mutate(prev);
        pendingRef.current = next;
        return next;
      });
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        flush();
      }, SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  return { settings, update, saveError };
}
