import type { InboxSection } from '../../types';
import { t } from '../../lib/i18n';
import { PrRow } from './PrRow';

export function SectionList({ sections }: { sections: InboxSection[] }): React.JSX.Element {
  const nonEmpty = sections.filter((s) => s.prs.length > 0);
  if (nonEmpty.length === 0) {
    return <div className="empty-state">{t('inboxEmpty')}</div>;
  }
  return (
    <div className="section-list">
      {nonEmpty.map((section) => (
        <section key={section.id}>
          <h2 className="section-header">
            {section.label}
            <span className="section-count">{section.prs.length}</span>
            {section.truncated && <span className="section-truncated">{t('truncated')}</span>}
          </h2>
          {section.prs.map((pr) => (
            <PrRow key={pr.id} pr={pr} />
          ))}
        </section>
      ))}
    </div>
  );
}
