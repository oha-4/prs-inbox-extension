import { MessageSquare } from 'lucide-react';
import type { PullRequest } from '../../types';
import { formatRelative } from '../../lib/time';
import { cn } from '@/lib/utils';
import { StateIcon } from './StateIcon';

export function PrRow({ pr }: { pr: PullRequest }): React.JSX.Element {
  const open = (e: React.MouseEvent): void => {
    e.preventDefault();
    void chrome.tabs.create({ url: pr.url, active: !e.metaKey && !e.ctrlKey });
    if (!e.metaKey && !e.ctrlKey) window.close();
  };
  return (
    <a
      className="group hover:bg-accent/60 flex items-center gap-2.5 border-b px-3 py-2 no-underline transition-colors duration-150"
      href={pr.url}
      onClick={open}
    >
      <StateIcon pr={pr} className="transition-transform duration-200 group-hover:scale-110" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          {!pr.isReadByCurrentUser && (
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-blue-500" />
          )}
          <span
            className={cn(
              'text-foreground truncate text-[13px] leading-tight',
              !pr.isReadByCurrentUser && 'font-semibold',
            )}
            title={pr.title}
          >
            {pr.title}
          </span>
        </span>
        <span className="text-muted-foreground truncate text-[11px]">
          {pr.repoNameWithOwner}#{pr.number}
          {pr.authorLogin ? ` · ${pr.authorLogin}` : ''}
          {pr.updatedAt ? ` · ${formatRelative(pr.updatedAt)}` : ''}
        </span>
      </span>
      {pr.commentCount > 0 && (
        <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-[11px]">
          <MessageSquare className="size-3" />
          {pr.commentCount}
        </span>
      )}
      {pr.authorLogin && (
        <img
          className="ring-border size-5 shrink-0 rounded-full ring-1 transition-transform duration-200 group-hover:scale-110"
          src={`https://github.com/${encodeURIComponent(pr.authorLogin)}.png?size=40`}
          alt=""
          loading="lazy"
        />
      )}
    </a>
  );
}
