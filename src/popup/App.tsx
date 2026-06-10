import { useMemo, useState } from 'react';
import { filterSections } from '../lib/filters';
import { t } from '../lib/i18n';
import { SECTION_ORDER } from '../lib/settings';
import { formatRelative } from '../lib/time';
import { ErrorBanner } from './components/ErrorBanner';
import { SectionList } from './components/SectionList';
import { useSettings } from './hooks/useSettings';
import { useSnapshot } from './hooks/useSnapshot';
import { SettingsView } from './views/SettingsView';

function fetchedLabel(fetchedAt: number): string {
  const rel = formatRelative(new Date(fetchedAt).toISOString());
  return rel === 'now' ? t('updatedJustNow') : t('updatedAgo', rel);
}

export function App(): React.JSX.Element {
  const { snapshot, refreshing, refresh } = useSnapshot();
  const { settings, update } = useSettings();
  const [view, setView] = useState<'list' | 'settings'>('list');

  const sections = useMemo(() => {
    if (!snapshot || !settings) return [];
    const filtered = filterSections(snapshot.sections, settings.allowlist, settings.blocklist);
    return [...filtered].sort(
      (a, b) => SECTION_ORDER.indexOf(a.id) - SECTION_ORDER.indexOf(b.id),
    );
  }, [snapshot, settings]);

  return (
    <div className="app">
      <header className="header">
        <span className="header-title">
          PRs Inbox
          {snapshot && snapshot.fetchedAt > 0 && (
            <span className="header-fetched">{fetchedLabel(snapshot.fetchedAt)}</span>
          )}
        </span>
        <span className="header-actions">
          <button
            type="button"
            className={`icon-button${refreshing ? ' spinning' : ''}`}
            title={t('refresh')}
            onClick={refresh}
          >
            ⟳
          </button>
          <button
            type="button"
            className={`icon-button${view === 'settings' ? ' active' : ''}`}
            title={t('settings')}
            onClick={() => setView(view === 'settings' ? 'list' : 'settings')}
          >
            ⚙
          </button>
          <button
            type="button"
            className="icon-button"
            title={t('openInbox')}
            onClick={() => void chrome.tabs.create({ url: 'https://github.com/pulls/inbox' })}
          >
            ↗
          </button>
        </span>
      </header>

      {view === 'settings' && settings ? (
        <SettingsView settings={settings} update={update} />
      ) : (
        <>
          {snapshot && <ErrorBanner snapshot={snapshot} />}
          {snapshot === null ? (
            <div className="empty-state">{t('loading')}</div>
          ) : (
            <SectionList sections={sections} />
          )}
        </>
      )}
    </div>
  );
}
