import { MessageSquare } from 'lucide-react';
import type { ClickBehavior, PullRequest } from '../../types';
import { localizeRelative } from '../../lib/i18n';
import { resolveClickAction } from '../../lib/openPr';
import { formatRelative } from '../../lib/time';
import { cn } from '@/lib/utils';
import { openPr } from '../lib/openPr';
import { StateIcon } from './StateIcon';

export function PrRow({
  pr,
  clickBehavior,
}: {
  pr: PullRequest;
  clickBehavior: ClickBehavior;
}): React.JSX.Element {
  // 左クリック / 中クリック共通の入口。middle は onAuxClick から true で渡す。
  const handle = (e: React.MouseEvent, middle: boolean): void => {
    const action = resolveClickAction(clickBehavior, {
      meta: e.metaKey,
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
      middle,
    });
    // null（Shift）はインターセプトせず、アンカー href のネイティブ動作（新規ウィンドウ）に任せる。
    if (action === null) return;
    e.preventDefault();
    void openPr(pr, action);
  };
  const onClick = (e: React.MouseEvent): void => handle(e, false);
  // 中クリックは onClick では発火しない。button === 1 のみ拾い、他ボタンはネイティブに委ねる。
  const onAuxClick = (e: React.MouseEvent): void => {
    if (e.button !== 1) return;
    handle(e, true);
  };
  const unread = !pr.isReadByCurrentUser;
  // null（不正日時 or 想定外形式）のときはセパレータごと非表示にする
  const relTime = pr.updatedAt ? localizeRelative(formatRelative(pr.updatedAt)) : null;
  return (
    <a
      className={cn(
        'group relative flex items-center gap-2.5 border-b py-2 pr-3.5 pl-3.5 no-underline transition-colors duration-150',
        'hover:bg-accent/50',
        // left rail: pure hover affordance (brand green), independent of read state
        'before:bg-signal before:absolute before:top-0 before:left-0 before:h-full before:w-[2px] before:origin-top before:scale-y-0 before:transition-transform before:duration-200 before:content-[""]',
        'hover:before:scale-y-100',
      )}
      href={pr.url}
      onClick={onClick}
      onAuxClick={onAuxClick}
    >
      <StateIcon pr={pr} className="transition-transform duration-200 group-hover:scale-110" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1.5">
          {unread && (
            <span
              role="img"
              className="bg-unread size-1.5 shrink-0 rounded-full"
              aria-label="unread"
            />
          )}
          <span
            className={cn(
              'text-foreground truncate text-[13px] leading-tight',
              unread ? 'font-semibold' : 'font-normal',
            )}
            title={pr.title}
          >
            {pr.title}
          </span>
        </span>
        <span className="text-muted-foreground flex items-center gap-1.5 font-mono text-[10px] leading-none">
          <span className="text-foreground/55 truncate">{pr.repoNameWithOwner}</span>
          <span className="text-foreground/45">#{pr.number}</span>
          {pr.authorLogin && (
            <>
              <span className="opacity-40">·</span>
              <span className="truncate">{pr.authorLogin}</span>
            </>
          )}
          {relTime && (
            <>
              <span className="opacity-40">·</span>
              <span>{relTime}</span>
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
          className="ring-border size-5 shrink-0 rounded-full ring-1"
          src={`https://github.com/${encodeURIComponent(pr.authorLogin)}.png?size=40`}
          alt=""
          loading="lazy"
        />
      )}
    </a>
  );
}
