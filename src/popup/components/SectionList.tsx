import { Inbox } from 'lucide-react';
import type { InboxSection } from '../../types';
import { t } from '../../lib/i18n';
import { PrRow } from './PrRow';

export function SectionList({ sections }: { sections: InboxSection[] }): React.JSX.Element {
  const nonEmpty = sections.filter((s) => s.prs.length > 0);
  if (nonEmpty.length === 0) {
    return (
      <div className="animate-in fade-in zoom-in-95 text-muted-foreground flex flex-col items-center gap-3 py-16 duration-300">
        <Inbox className="size-8" strokeWidth={1.25} />
        <span className="text-[13px]">{t('inboxEmpty')}</span>
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
          <h2 className="bg-background/80 sticky top-0 z-[1] m-0 flex items-center gap-2 border-b px-3.5 py-2 backdrop-blur-md">
            <span className="bg-signal h-3 w-0.5 shrink-0 rounded-full" aria-hidden />
            <span className="font-display text-foreground text-[11px] font-bold tracking-[0.08em] uppercase">
              {section.label}
            </span>
            <span className="font-mono text-muted-foreground text-[11px]">
              {String(section.prs.length).padStart(2, '0')}
            </span>
            {section.truncated && (
              <span className="font-mono text-muted-foreground text-[9px] tracking-wide uppercase">
                {t('truncated')}
              </span>
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
