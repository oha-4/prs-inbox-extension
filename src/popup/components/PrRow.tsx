import type { PullRequest } from '../../types';
import { formatRelative } from '../../lib/time';
import { StateIcon } from './StateIcon';

const COMMENT_PATH =
  'M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z';

export function PrRow({ pr }: { pr: PullRequest }): React.JSX.Element {
  const open = (e: React.MouseEvent): void => {
    e.preventDefault();
    void chrome.tabs.create({ url: pr.url, active: !e.metaKey && !e.ctrlKey });
    if (!e.metaKey && !e.ctrlKey) window.close();
  };
  return (
    <a className={`pr-row${pr.isReadByCurrentUser ? '' : ' unread'}`} href={pr.url} onClick={open}>
      <StateIcon pr={pr} />
      <span className="pr-main">
        <span className="pr-title" title={pr.title}>
          {pr.title}
        </span>
        <span className="pr-meta">
          {pr.repoNameWithOwner}#{pr.number}
          {pr.authorLogin ? ` · ${pr.authorLogin}` : ''}
          {pr.updatedAt ? ` · ${formatRelative(pr.updatedAt)}` : ''}
        </span>
      </span>
      {pr.authorLogin && (
        <img
          className="pr-avatar"
          src={`https://github.com/${encodeURIComponent(pr.authorLogin)}.png?size=32`}
          alt=""
          loading="lazy"
        />
      )}
      {pr.commentCount > 0 && (
        <span className="pr-comments">
          <svg viewBox="0 0 16 16" width="12" height="12">
            <path fill="currentColor" d={COMMENT_PATH} />
          </svg>
          {pr.commentCount}
        </span>
      )}
    </a>
  );
}
