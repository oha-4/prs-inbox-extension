import {
  GitMerge,
  GitPullRequestArrow,
  GitPullRequestClosed,
  GitPullRequestDraft,
} from 'lucide-react';
import type { PullRequest } from '../../types';
import { cn } from '@/lib/utils';

export function StateIcon({ pr, className }: { pr: PullRequest; className?: string }): React.JSX.Element {
  const cls = cn('size-4 shrink-0', className);
  if (pr.state === 'MERGED') return <GitMerge className={cn(cls, 'text-purple-500')} aria-label="merged" />;
  if (pr.state === 'CLOSED')
    return <GitPullRequestClosed className={cn(cls, 'text-red-500')} aria-label="closed" />;
  if (pr.isDraft)
    return <GitPullRequestDraft className={cn(cls, 'text-muted-foreground')} aria-label="draft" />;
  return <GitPullRequestArrow className={cn(cls, 'text-emerald-500')} aria-label="open" />;
}
