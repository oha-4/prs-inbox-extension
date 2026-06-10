import type { InboxSnapshot } from '../../types';
import { t } from '../../lib/i18n';

export function ErrorBanner({ snapshot }: { snapshot: InboxSnapshot }): React.JSX.Element | null {
  if (snapshot.authState === 'ok') return null;

  if (snapshot.authState === 'logged_out') {
    return (
      <div className="banner banner-warn">
        {t('notLoggedIn')}
        <a
          href="https://github.com/login"
          onClick={(e) => {
            e.preventDefault();
            void chrome.tabs.create({ url: 'https://github.com/login' });
          }}
        >
          {t('logIn')}
        </a>
      </div>
    );
  }
  if (snapshot.authState === 'rate_limited') {
    return <div className="banner banner-warn">{t('rateLimited')}</div>;
  }
  return (
    <div className="banner banner-error">
      {t('fetchFailed')}
      {snapshot.errorDetail ? `: ${snapshot.errorDetail}` : ''}
    </div>
  );
}
