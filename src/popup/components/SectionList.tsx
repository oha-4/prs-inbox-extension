import { Inbox } from 'lucide-react';
import type { InboxSection } from '../../types';
import { t } from '../../lib/i18n';
import { Badge } from '@/components/ui/badge';
import { PrRow } from './PrRow';

export function SectionList({ sections }: { sections: InboxSection[] }): React.JSX.Element {
  const nonEmpty = sections.filter((s) => s.prs.length > 0);
  if (nonEmpty.length === 0) {
    return (
      <div className="animate-in fade-in zoom-in-95 text-muted-foreground flex flex-col items-center gap-2 py-14 duration-300">
        <Inbox className="size-8" />
        <span className="text-sm">{t('inboxEmpty')}</span>
      </div>
    );
  }
  return (
    <div className="overflow-y-auto">
      {nonEmpty.map((section, i) => (
        <section
          key={section.id}
          className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <h2 className="bg-muted/95 text-muted-foreground sticky top-0 z-[1] m-0 flex items-center gap-2 border-b px-3 py-1.5 text-[11px] font-semibold tracking-wide uppercase backdrop-blur-sm">
            {section.label}
            <Badge variant="secondary">{section.prs.length}</Badge>
            {section.truncated && (
              <span className="font-normal normal-case">{t('truncated')}</span>
            )}
          </h2>
          {section.prs.map((pr) => (
            <PrRow key={pr.id} pr={pr} />
          ))}
        </section>
      ))}
    </div>
  );
}
