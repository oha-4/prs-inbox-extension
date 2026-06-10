import { useState } from 'react';
import type { Settings, TabGroupColor } from '../../types';
import { t } from '../../lib/i18n';
import { SECTION_ORDER } from '../../lib/settings';
import { sendMessage } from '../../messages';

const COLORS: TabGroupColor[] = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
];

interface Props {
  settings: Settings;
  update: (mutate: (s: Settings) => Settings) => void;
}

export function SettingsView({ settings, update }: Props): React.JSX.Element {
  const sectionIds = [
    ...SECTION_ORDER,
    ...Object.keys(settings.sections).filter((id) => !SECTION_ORDER.includes(id)),
  ];

  return (
    <div className="settings">
      <h2>{t('tabGroupSyncHeader')}</h2>
      <p className="hint">{t('tabGroupSyncHint')}</p>
      <div className="section-settings">
        {sectionIds.map((id) => {
          const cfg = settings.sections[id];
          if (!cfg) return null;
          return (
            <div key={id} className={`section-setting${cfg.enabled ? '' : ' disabled'}`}>
              <label className="section-toggle">
                <input
                  type="checkbox"
                  checked={cfg.enabled}
                  onChange={(e) =>
                    update((s) => ({
                      ...s,
                      sections: {
                        ...s.sections,
                        [id]: { ...cfg, enabled: e.target.checked },
                      },
                    }))
                  }
                />
                {cfg.label}
              </label>
              {cfg.enabled && (
                <span className="section-group-config">
                  <DebouncedText
                    value={cfg.groupName}
                    placeholder={t('groupNamePlaceholder')}
                    onCommit={(v) =>
                      update((s) => ({
                        ...s,
                        sections: { ...s.sections, [id]: { ...cfg, groupName: v || cfg.groupName } },
                      }))
                    }
                  />
                  <select
                    value={cfg.groupColor}
                    onChange={(e) =>
                      update((s) => ({
                        ...s,
                        sections: {
                          ...s.sections,
                          [id]: { ...cfg, groupColor: e.target.value as TabGroupColor },
                        },
                      }))
                    }
                  >
                    {COLORS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </span>
              )}
            </div>
          );
        })}
      </div>

      <label className="row">
        <input
          type="checkbox"
          checked={settings.autoCloseRemoved}
          onChange={(e) => update((s) => ({ ...s, autoCloseRemoved: e.target.checked }))}
        />
        {t('autoCloseLabel')}
      </label>

      <h2>{t('fetchHeader')}</h2>
      <label className="row">
        {t('pollIntervalLabel')}
        <input
          type="number"
          min={1}
          max={120}
          value={settings.pollIntervalMinutes}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= 1) {
              update((s) => ({ ...s, pollIntervalMinutes: Math.floor(v) }));
            }
          }}
        />
      </label>
      <label className="row">
        {t('maxPrAgeLabel')}
        <select
          value={settings.maxPrAge}
          onChange={(e) => update((s) => ({ ...s, maxPrAge: e.target.value }))}
        >
          <option value="1m">{t('age1m')}</option>
          <option value="1y">{t('age1y')}</option>
        </select>
      </label>

      <h2>{t('filtersHeader')}</h2>
      <label className="row column">
        {t('allowlistLabel')}
        <DebouncedTextarea
          value={settings.allowlist.join('\n')}
          onCommit={(v) => update((s) => ({ ...s, allowlist: parseList(v) }))}
        />
      </label>
      <label className="row column">
        {t('blocklistLabel')}
        <DebouncedTextarea
          value={settings.blocklist.join('\n')}
          onCommit={(v) => update((s) => ({ ...s, blocklist: parseList(v) }))}
        />
      </label>

      <h2>{t('debugHeader')}</h2>
      <label className="row">
        <input
          type="checkbox"
          checked={settings.debugMode}
          onChange={(e) => update((s) => ({ ...s, debugMode: e.target.checked }))}
        />
        {t('debugModeLabel')}
      </label>
      {settings.debugMode && <DumpButton />}
    </div>
  );
}

function parseList(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** storage.sync の書き込みクォータ対策: blur時にのみ保存するテキスト入力 */
function DebouncedText(props: {
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(props.value);
  return (
    <input
      type="text"
      value={draft}
      placeholder={props.placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== props.value) props.onCommit(draft.trim());
      }}
    />
  );
}

function DebouncedTextarea(props: {
  value: string;
  onCommit: (v: string) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(props.value);
  return (
    <textarea
      rows={3}
      value={draft}
      placeholder={t('filterPlaceholder')}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== props.value) props.onCommit(draft);
      }}
    />
  );
}

function DumpButton(): React.JSX.Element {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  return (
    <button
      type="button"
      disabled={state === 'running'}
      onClick={() => {
        setState('running');
        void sendMessage<{ saved: number }>({ type: 'DUMP_DEBUG' }).then(() => setState('done'));
      }}
    >
      {state === 'running' ? t('dumpRunning') : state === 'done' ? t('dumpDone') : t('dumpButton')}
    </button>
  );
}
