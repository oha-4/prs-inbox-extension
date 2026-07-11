import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw, Settings } from 'lucide-react';
import { filterSections } from '../lib/filters';
import { t } from '../lib/i18n';
import { inboxOrderIndex, isSectionHidden } from '../lib/settings';
import { formatRelative } from '../lib/time';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBanner } from './components/ErrorBanner';
import { SectionList } from './components/SectionList';
import { useSettings } from './hooks/useSettings';
import { useSnapshot } from './hooks/useSnapshot';
import { SettingsView } from './views/SettingsView';

const REL_UNIT_KEY: Record<string, string> = {
  m: 'relMin',
  h: 'relHour',
  d: 'relDay',
  mo: 'relMonth',
  y: 'relYear',
};

/** ヘッダー用: 短縮形(4m)を単位付き(4分 / 4 min)にローカライズ。各PR行は短縮形のまま */
function localizeRelative(short: string): string {
  const m = /^(\d+)(mo|m|h|d|y)$/.exec(short);
  if (!m) return short;
  const key = REL_UNIT_KEY[m[2]!];
  return key ? t(key, m[1]!) : short;
}

function fetchedLabel(fetchedAt: number): string {
  const diff = Date.now() - fetchedAt;
  if (diff < 10_000) return t('updatedJustNow');
  if (diff < 60_000) return t('updatedWithinMinute');
  return t('updatedAgo', localizeRelative(formatRelative(new Date(fetchedAt).toISOString())));
}

/** ポップアップを開いている間、相対時刻を毎秒生かす */
function useTick(intervalMs: number): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

function LoadingSkeleton(): React.JSX.Element {
  return (
    <div className="animate-in fade-in duration-200">
      {Array.from({ length: 6 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
        <div key={i} className="flex items-center gap-2.5 border-b px-3 py-2">
          <Skeleton className="size-4 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
          <Skeleton className="size-5 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function App(): React.JSX.Element {
  const { snapshot, refreshing, refresh } = useSnapshot();
  const { settings, update } = useSettings();
  const [view, setView] = useState<'list' | 'settings'>('list');
  useTick(1000);

  const sections = useMemo(() => {
    if (!snapshot || !settings) return [];
    const filtered = filterSections(snapshot.sections, settings.allowlist, settings.blocklist);
    return [...filtered]
      .filter((s) => !isSectionHidden(s.id, settings))
      .sort((a, b) => inboxOrderIndex(a.id, settings) - inboxOrderIndex(b.id, settings));
  }, [snapshot, settings]);

  return (
    <div className="bg-background text-foreground flex max-h-[580px] flex-col">
      <header className="bg-background/70 sticky top-0 z-10 flex items-center justify-between border-b px-3.5 py-2.5 backdrop-blur-md">
        <span className="flex items-center gap-2.5">
          <span className="bg-signal signal-led size-2 shrink-0 rounded-full" aria-hidden />
          <span className="flex flex-col leading-none">
            <span className="font-sans text-[15px] leading-none font-bold tracking-[-0.01em]">
              PRs<span className="text-signal">.</span>Inbox
            </span>
            <span className="font-mono text-muted-foreground mt-1 text-[9px] tracking-[0.16em] uppercase">
              {snapshot && snapshot.fetchedAt > 0 ? (
                <span className="animate-in fade-in">{fetchedLabel(snapshot.fetchedAt)}</span>
              ) : (
                'live'
              )}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" title={t('refresh')} onClick={refresh}>
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={t('settings')}
            className={cn(view === 'settings' && 'bg-accent text-accent-foreground')}
            onClick={() => setView(view === 'settings' ? 'list' : 'settings')}
          >
            <Settings
              className={cn(
                'size-3.5 transition-transform duration-300',
                view === 'settings' && 'rotate-90',
              )}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={t('openInbox')}
            onClick={() => void chrome.tabs.create({ url: 'https://github.com/pulls/inbox' })}
          >
            <ExternalLink className="size-3.5" />
          </Button>
        </span>
      </header>

      {view === 'settings' && settings ? (
        <SettingsView settings={settings} update={update} />
      ) : (
        <>
          {snapshot && <ErrorBanner snapshot={snapshot} />}
          {snapshot === null ? <LoadingSkeleton /> : <SectionList sections={sections} />}
        </>
      )}
    </div>
  );
}
