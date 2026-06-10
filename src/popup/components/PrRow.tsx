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
  const unread = !pr.isReadByCurrentUser;
  return (
    <a
      className={cn(
        'group relative flex items-center gap-2.5 border-b py-2 pr-3.5 pl-3.5 no-underline transition-colors duration-150',
        'hover:bg-accent/50',
        // left signal rail: hidden until hover (or always-on dim for unread)
        'before:bg-signal before:absolute before:top-0 before:left-0 before:h-full before:w-[2px] before:origin-top before:transition-transform before:duration-200 before:content-[""]',
        unread ? 'before:scale-y-100 before:opacity-40' : 'before:scale-y-0',
        'hover:before:scale-y-100 hover:before:opacity-100',
      )}
      href={pr.url}
      onClick={open}
    >
      <StateIcon pr={pr} className="transition-transform duration-200 group-hover:scale-110" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          className={cn(
            'truncate text-[13px] leading-tight',
            unread ? 'text-foreground font-semibold' : 'text-foreground/80 font-normal',
          )}
          title={pr.title}
        >
          {pr.title}
        </span>
        <span className="text-muted-foreground flex items-center gap-1.5 font-mono text-[10px] leading-none">
          <span className="text-foreground/55 truncate">{pr.repoNameWithOwner}</span>
          <span className="text-signal/70">#{pr.number}</span>
          {pr.authorLogin && (
            <>
              <span className="opacity-40">·</span>
              <span className="truncate">{pr.authorLogin}</span>
            </>
          )}
          {pr.updatedAt && (
            <>
              <span className="opacity-40">·</span>
              <span>{formatRelative(pr.updatedAt)}</span>
            </>
          )}
        </span>
      </span>
      {pr.commentCount > 0 && (
        <span className="text-muted-foreground flex shrink-0 items-center gap-1 font-mono text-[10px]">
          <MessageSquare className="size-3" />
          {pr.commentCount}
        </span>
      )}
      {pr.authorLogin && (
        <img
          className="ring-border size-5 shrink-0 rounded-full ring-1 grayscale transition-all duration-200 group-hover:grayscale-0"
          src={`https://github.com/${encodeURIComponent(pr.authorLogin)}.png?size=40`}
          alt=""
          loading="lazy"
        />
      )}
    </a>
  );
}
