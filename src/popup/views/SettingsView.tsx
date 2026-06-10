import { useState } from 'react';
import { Bell, Bug, Check, CloudDownload, Filter, FolderSync, Loader2 } from 'lucide-react';
import type { Settings as SettingsType, TabGroupColor } from '../../types';
import { t } from '../../lib/i18n';
import { SECTION_ORDER } from '../../lib/settings';
import { sendMessage } from '../../messages';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const GROUP_COLORS: Record<TabGroupColor, string> = {
  grey: '#5f6368',
  blue: '#1a73e8',
  red: '#d93025',
  yellow: '#f9ab00',
  green: '#188038',
  pink: '#d01884',
  purple: '#a142f4',
  cyan: '#007b83',
  orange: '#fa903e',
};

interface Props {
  settings: SettingsType;
  update: (mutate: (s: SettingsType) => SettingsType) => void;
}

function SectionHeader({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <h2 className="text-foreground font-display m-0 flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] uppercase">
      <span className="bg-signal h-3 w-0.5 shrink-0 rounded-full" aria-hidden />
      <Icon className="text-muted-foreground size-3.5" />
      {children}
    </h2>
  );
}

export function SettingsView({ settings, update }: Props): React.JSX.Element {
  const sectionIds = [
    ...SECTION_ORDER,
    ...Object.keys(settings.sections).filter((id) => !SECTION_ORDER.includes(id)),
  ];

  return (
    <div className="animate-in fade-in slide-in-from-right-4 space-y-5 overflow-y-auto p-3 duration-200">
      <section className="space-y-2">
        <SectionHeader icon={FolderSync}>{t('tabGroupSyncHeader')}</SectionHeader>
        <p className="text-muted-foreground m-0 text-[11px]">{t('tabGroupSyncHint')}</p>
        <div className="divide-y rounded-lg border">
          {sectionIds.map((id) => {
            const cfg = settings.sections[id];
            if (!cfg) return null;
            return (
              <div
                key={id}
                className={cn(
                  'flex min-h-11 items-center justify-between gap-2 px-2.5 py-1.5 transition-opacity',
                  !cfg.enabled && 'opacity-60',
                )}
              >
                <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                  <Switch
                    checked={cfg.enabled}
                    onCheckedChange={(checked) =>
                      update((s) => ({
                        ...s,
                        sections: { ...s.sections, [id]: { ...cfg, enabled: checked } },
                      }))
                    }
                  />
                  {cfg.label}
                </label>
                {cfg.enabled && (
                  <span className="animate-in fade-in slide-in-from-right-2 flex items-center gap-1.5 duration-200">
                    <DebouncedText
                      value={cfg.groupName}
                      placeholder={t('groupNamePlaceholder')}
                      onCommit={(v) =>
                        update((s) => ({
                          ...s,
                          sections: {
                            ...s.sections,
                            [id]: { ...cfg, groupName: v || cfg.groupName },
                          },
                        }))
                      }
                    />
                    <ColorPicker
                      value={cfg.groupColor}
                      onChange={(color) =>
                        update((s) => ({
                          ...s,
                          sections: {
                            ...s.sections,
                            [id]: { ...cfg, groupColor: color },
                          },
                        }))
                      }
                    />
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <Switch
            checked={settings.autoCloseRemoved}
            onCheckedChange={(checked) => update((s) => ({ ...s, autoCloseRemoved: checked }))}
          />
          {t('autoCloseLabel')}
        </label>
      </section>

      <section className="space-y-2">
        <SectionHeader icon={Bell}>{t('badgeHeader')}</SectionHeader>
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <Switch
            checked={settings.badgeIncludeTeamReview}
            onCheckedChange={(checked) =>
              update((s) => ({ ...s, badgeIncludeTeamReview: checked }))
            }
          />
          {t('badgeIncludeTeamLabel')}
        </label>
      </section>

      <section className="space-y-2">
        <SectionHeader icon={CloudDownload}>{t('fetchHeader')}</SectionHeader>
        <label className="flex items-center justify-between gap-2 text-[13px]">
          {t('pollIntervalLabel')}
          <Input
            type="number"
            min={1}
            max={120}
            className="h-7 w-16 text-xs"
            value={settings.pollIntervalMinutes}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 1) {
                update((s) => ({ ...s, pollIntervalMinutes: Math.floor(v) }));
              }
            }}
          />
        </label>
        <label className="flex items-center justify-between gap-2 text-[13px]">
          {t('maxPrAgeLabel')}
          <Select
            value={settings.maxPrAge}
            onValueChange={(v) => update((s) => ({ ...s, maxPrAge: v }))}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1m">{t('age1m')}</SelectItem>
              <SelectItem value="1y">{t('age1y')}</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </section>

      <section className="space-y-2">
        <SectionHeader icon={Filter}>{t('filtersHeader')}</SectionHeader>
        <label className="flex flex-col gap-1 text-[13px]">
          {t('allowlistLabel')}
          <DebouncedTextarea
            value={settings.allowlist.join('\n')}
            onCommit={(v) => update((s) => ({ ...s, allowlist: parseList(v) }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          {t('blocklistLabel')}
          <DebouncedTextarea
            value={settings.blocklist.join('\n')}
            onCommit={(v) => update((s) => ({ ...s, blocklist: parseList(v) }))}
          />
        </label>
      </section>

      <section className="space-y-2">
        <SectionHeader icon={Bug}>{t('debugHeader')}</SectionHeader>
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <Switch
            checked={settings.debugMode}
            onCheckedChange={(checked) => update((s) => ({ ...s, debugMode: checked }))}
          />
          {t('debugModeLabel')}
        </label>
        {settings.debugMode && (
          <div className="animate-in fade-in slide-in-from-top-1 duration-200">
            <DumpButton />
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Chromeのタブグループ色ピッカー風: 3×3グリッドの丸、選択中は二重丸。
 * 色名テキストを出さないのでローカリゼーション不要。
 */
function ColorPicker({
  value,
  onChange,
}: {
  value: TabGroupColor;
  onChange: (color: TabGroupColor) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={value}
          className="border-input hover:bg-accent focus-visible:border-ring focus-visible:ring-ring/50 flex h-7 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border bg-transparent shadow-xs transition-colors outline-none focus-visible:ring-[3px]"
        >
          <span
            className="size-3.5 rounded-full"
            style={{ backgroundColor: GROUP_COLORS[value] }}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid grid-cols-3 gap-1">
        {(Object.keys(GROUP_COLORS) as TabGroupColor[]).map((c) => {
          const selected = c === value;
          return (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={selected}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className={cn(
                'flex size-7 cursor-pointer items-center justify-center rounded-full border-2 transition-transform duration-150 outline-none hover:scale-110 focus-visible:scale-110',
                selected ? 'p-px' : 'border-transparent',
              )}
              style={selected ? { borderColor: GROUP_COLORS[c] } : undefined}
            >
              <span
                className="block size-4 rounded-full"
                style={{ backgroundColor: GROUP_COLORS[c] }}
              />
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
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
    <Input
      type="text"
      className="h-7 w-28 text-xs"
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
    <Textarea
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
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={state === 'running'}
      onClick={() => {
        setState('running');
        void sendMessage<{ saved: number }>({ type: 'DUMP_DEBUG' }).then(() => setState('done'));
      }}
    >
      {state === 'running' ? (
        <Loader2 className="size-3 animate-spin" />
      ) : state === 'done' ? (
        <Check className="size-3 text-emerald-500" />
      ) : (
        <Bug className="size-3" />
      )}
      {state === 'running' ? t('dumpRunning') : state === 'done' ? t('dumpDone') : t('dumpButton')}
    </Button>
  );
}
