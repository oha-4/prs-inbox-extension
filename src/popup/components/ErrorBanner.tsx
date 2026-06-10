import { CircleAlert, Hourglass, LogIn, TriangleAlert } from 'lucide-react';
import type { InboxSnapshot } from '../../types';
import { t } from '../../lib/i18n';
import { Button } from '@/components/ui/button';

export function ErrorBanner({ snapshot }: { snapshot: InboxSnapshot }): React.JSX.Element | null {
  if (snapshot.authState === 'ok') return null;

  if (snapshot.authState === 'logged_out') {
    return (
      <div className="animate-in slide-in-from-top-2 fade-in flex items-center gap-2 border-b bg-amber-500/10 px-3 py-2 text-xs text-amber-700 duration-200 dark:text-amber-400">
        <TriangleAlert className="size-3.5 shrink-0" />
        <span className="flex-1">{t('notLoggedIn')}</span>
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1 px-2 text-[11px]"
          onClick={() => void chrome.tabs.create({ url: 'https://github.com/login' })}
        >
          <LogIn className="size-3" />
          {t('logIn')}
        </Button>
      </div>
    );
  }
  if (snapshot.authState === 'rate_limited') {
    return (
      <div className="animate-in slide-in-from-top-2 fade-in flex items-center gap-2 border-b bg-amber-500/10 px-3 py-2 text-xs text-amber-700 duration-200 dark:text-amber-400">
        <Hourglass className="size-3.5 shrink-0 animate-pulse" />
        {t('rateLimited')}
      </div>
    );
  }
  return (
    <div className="animate-in slide-in-from-top-2 fade-in bg-destructive/10 text-destructive flex items-center gap-2 border-b px-3 py-2 text-xs break-all duration-200">
      <CircleAlert className="size-3.5 shrink-0" />
      <span>
        {t('fetchFailed')}
        {snapshot.errorDetail ? `: ${snapshot.errorDetail}` : ''}
      </span>
    </div>
  );
}
