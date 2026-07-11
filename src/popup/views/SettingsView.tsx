import { useState } from 'react';
import {
  ArrowDownUp,
  Bell,
  Bug,
  Check,
  ChevronDown,
  ChevronUp,
  CloudDownload,
  Eye,
  EyeOff,
  Filter,
  FolderSync,
  GripVertical,
  ListFilter,
  Loader2,
  Plus,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Settings as SettingsType, SortKey } from '../../types';
import { t } from '../../lib/i18n';
import {
  CUSTOM_SECTION_PREFIX,
  listSections,
  MAX_CUSTOM_SECTIONS,
  MAX_SORT_CRITERIA,
  MAX_SYNC_GROUPS,
  orderedInboxSections,
  SORT_KEYS,
} from '../../lib/settings';
import { sendMessage } from '../../messages';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  const sections = listSections(settings);

  return (
    <div className="animate-in fade-in slide-in-from-right-4 space-y-5 overflow-y-auto p-3 duration-200">
      <section className="space-y-2">
        <SectionHeader icon={FolderSync}>{t('tabGroupSyncHeader')}</SectionHeader>
        <p className="text-muted-foreground m-0 text-[11px]">{t('tabGroupSyncHint')}</p>
        <div className="space-y-2">
          {settings.syncGroups.map((g) => {
            const trimmedName = g.name.trim();
            const duplicate =
              trimmedName.length > 0 &&
              settings.syncGroups.some((o) => o.id !== g.id && o.name.trim() === trimmedName);
            return (
              <div key={g.id} className="space-y-2 rounded-lg border p-2.5">
                <div className="flex items-center gap-1.5">
                  <DebouncedText
                    value={g.name}
                    placeholder={t('groupNamePlaceholder')}
                    className="flex-1"
                    onCommit={(v) =>
                      update((s) => ({
                        ...s,
                        syncGroups: s.syncGroups.map((x) =>
                          x.id === g.id ? { ...x, name: v } : x,
                        ),
                      }))
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    aria-label={t('deleteGroup')}
                    onClick={() =>
                      update((s) => ({
                        ...s,
                        syncGroups: s.syncGroups.filter((x) => x.id !== g.id),
                      }))
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <GroupSectionList
                  sectionIds={g.sectionIds}
                  sections={sections}
                  onChange={(next) =>
                    update((s) => ({
                      ...s,
                      syncGroups: s.syncGroups.map((x) =>
                        x.id === g.id ? { ...x, sectionIds: next } : x,
                      ),
                    }))
                  }
                />
                {trimmedName.length === 0 && (
                  <p className="m-0 text-[11px] text-amber-600 dark:text-amber-500">
                    {t('groupNameEmptyHint')}
                  </p>
                )}
                {g.sectionIds.length === 0 && (
                  <p className="m-0 text-[11px] text-amber-600 dark:text-amber-500">
                    {t('groupNoSectionsHint')}
                  </p>
                )}
                {duplicate && (
                  <p className="m-0 text-[11px] text-amber-600 dark:text-amber-500">
                    {t('groupNameDuplicateHint')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-7 gap-1 px-2 text-[11px]"
          disabled={settings.syncGroups.length >= MAX_SYNC_GROUPS}
          onClick={() =>
            update((s) => ({
              ...s,
              syncGroups: [...s.syncGroups, { id: crypto.randomUUID(), name: '', sectionIds: [] }],
            }))
          }
        >
          <Plus className="size-3" />
          {t('addGroup')}
        </Button>
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <Switch
            checked={settings.autoCloseRemoved}
            onCheckedChange={(checked) => update((s) => ({ ...s, autoCloseRemoved: checked }))}
          />
          {t('autoCloseLabel')}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <Switch
            checked={settings.forceAlignOnRefresh}
            onCheckedChange={(checked) => update((s) => ({ ...s, forceAlignOnRefresh: checked }))}
          />
          {t('forceAlignOnRefreshLabel')}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <Switch
            checked={settings.keepEmptyGroups}
            onCheckedChange={(checked) => update((s) => ({ ...s, keepEmptyGroups: checked }))}
          />
          {t('keepEmptyGroupsLabel')}
        </label>
        {settings.keepEmptyGroups && (
          <p className="text-muted-foreground animate-in fade-in m-0 pl-7 text-[11px] duration-200">
            {t('keepEmptyGroupsHint')}
          </p>
        )}
        <ForceAlignButton />
      </section>

      <section className="space-y-2">
        <SectionHeader icon={ListFilter}>{t('customSectionHeader')}</SectionHeader>
        <p className="text-muted-foreground m-0 text-[11px]">{t('customSectionHint')}</p>
        {settings.customSections.map((ci) => (
          <div key={ci.id} className="flex items-center gap-1.5">
            <DebouncedText
              value={ci.name}
              placeholder={t('customSectionNamePlaceholder')}
              className="w-24"
              onCommit={(v) =>
                update((s) => ({
                  ...s,
                  customSections: s.customSections.map((x) =>
                    x.id === ci.id ? { ...x, name: v } : x,
                  ),
                }))
              }
            />
            <DebouncedText
              value={ci.query}
              placeholder={t('customSectionQueryPlaceholder')}
              className="flex-1 font-mono text-[11px]"
              onCommit={(v) =>
                update((s) => ({
                  ...s,
                  customSections: s.customSections.map((x) =>
                    x.id === ci.id ? { ...x, query: v } : x,
                  ),
                }))
              }
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label={t('deleteCustomSection')}
              onClick={() =>
                update((s) => ({
                  ...s,
                  customSections: s.customSections.filter((x) => x.id !== ci.id),
                  syncGroups: s.syncGroups.map((gr) =>
                    gr.sectionIds.includes(ci.id)
                      ? { ...gr, sectionIds: gr.sectionIds.filter((id) => id !== ci.id) }
                      : gr,
                  ),
                  hiddenSections: s.hiddenSections.filter((id) => id !== ci.id),
                  inboxOrder: s.inboxOrder.filter((id) => id !== ci.id),
                }))
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-7 gap-1 px-2 text-[11px]"
          disabled={settings.customSections.length >= MAX_CUSTOM_SECTIONS}
          onClick={() =>
            update((s) => ({
              ...s,
              customSections: [
                ...s.customSections,
                { id: `${CUSTOM_SECTION_PREFIX}${crypto.randomUUID()}`, name: '', query: '' },
              ],
            }))
          }
        >
          <Plus className="size-3" />
          {t('addCustomSection')}
        </Button>
      </section>

      <section className="space-y-2">
        <SectionHeader icon={Eye}>{t('inboxSectionsHeader')}</SectionHeader>
        <p className="text-muted-foreground m-0 text-[11px]">{t('inboxSectionsHint')}</p>
        <InboxSectionList settings={settings} update={update} />
      </section>

      <section className="space-y-2">
        <SectionHeader icon={ArrowDownUp}>{t('sortHeader')}</SectionHeader>
        <p className="text-muted-foreground m-0 text-[11px]">{t('sortHint')}</p>
        <SortEditor settings={settings} update={update} />
      </section>

      <section className="space-y-2">
        <SectionHeader icon={Bell}>{t('badgeHeader')}</SectionHeader>
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <Switch
            checked={settings.badgeEnabled}
            onCheckedChange={(checked) => update((s) => ({ ...s, badgeEnabled: checked }))}
          />
          {t('badgeEnabledLabel')}
        </label>
        {settings.badgeEnabled && (
          <label className="animate-in fade-in flex cursor-pointer items-center gap-2 pl-7 text-[13px] duration-200">
            <Switch
              checked={settings.badgeIncludeTeamReview}
              onCheckedChange={(checked) =>
                update((s) => ({ ...s, badgeIncludeTeamReview: checked }))
              }
            />
            {t('badgeIncludeTeamLabel')}
          </label>
        )}
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

function sortKeyLabel(key: SortKey): string {
  return t(
    key === 'repo' ? 'sortKeyRepo' : key === 'created' ? 'sortKeyCreated' : 'sortKeyUpdated',
  );
}

function sortDirLabel(key: SortKey, dir: 'asc' | 'desc'): string {
  if (key === 'repo') return dir === 'asc' ? 'A→Z' : 'Z→A';
  return t(dir === 'asc' ? 'sortDirOld' : 'sortDirNew');
}

function SortEditor({ settings, update }: Props): React.JSX.Element {
  const criteria = settings.sortCriteria;
  const setCriteria = (next: typeof criteria): void =>
    update((s) => ({ ...s, sortCriteria: next }));
  const unused = SORT_KEYS.filter((k) => !criteria.some((c) => c.key === k));

  return (
    <div className="space-y-1.5">
      {criteria.map((c, idx) => {
        const usedByOthers = new Set(criteria.filter((_, i) => i !== idx).map((x) => x.key));
        const options = SORT_KEYS.filter((k) => k === c.key || !usedByOthers.has(k));
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional sort slots
          <div key={idx} className="flex items-center gap-1.5">
            <span className="text-muted-foreground font-mono text-[10px]">{idx + 1}</span>
            <Select
              value={c.key}
              onValueChange={(v) => {
                const next = [...criteria];
                next[idx] = { ...c, key: v as SortKey };
                setCriteria(next);
              }}
            >
              <SelectTrigger size="sm" className="flex-1">
                <SelectValue>{sortKeyLabel(c.key)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map((k) => (
                  <SelectItem key={k} value={k}>
                    {sortKeyLabel(k)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-20 justify-center px-2 text-[11px]"
              onClick={() => {
                const next = [...criteria];
                next[idx] = { ...c, dir: c.dir === 'asc' ? 'desc' : 'asc' };
                setCriteria(next);
              }}
            >
              {sortDirLabel(c.key, c.dir)}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t('sortRemove')}
              onClick={() => setCriteria(criteria.filter((_, i) => i !== idx))}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        );
      })}
      {criteria.length < MAX_SORT_CRITERIA && unused.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-7 gap-1 px-2 text-[11px]"
          onClick={() => setCriteria([...criteria, { key: unused[0]!, dir: 'asc' }])}
        >
          <Plus className="size-3" />
          {t('sortAddLevel')}
        </Button>
      )}
    </div>
  );
}

/**
 * popup 一覧に出すセクションの表示/非表示トグルと並べ替え（ドラッグ&ドロップ）。
 * 表示のみに影響（取得・バッジ・タブ同期には無関係）。並べ替えは全idを
 * materialize して inboxOrder に書き込み、順序を固定する。
 */
function InboxSectionList({
  settings,
  update,
}: {
  settings: SettingsType;
  update: (mutate: (s: SettingsType) => SettingsType) => void;
}): React.JSX.Element {
  const rows = orderedInboxSections(settings);
  const ids = rows.map((r) => r.id);
  const sensors = useSensors(
    // distance を付けないと Switch のクリックをドラッグが飲み込む
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const next = arrayMove(ids, from, to);
    update((s) => ({ ...s, inboxOrder: next }));
  };

  const toggle = (id: string, visible: boolean): void => {
    update((s) => ({
      ...s,
      hiddenSections: visible
        ? s.hiddenSections.filter((x) => x !== id)
        : [...new Set([...s.hiddenSections, id])],
    }));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {rows.map((row) => (
            <SortableInboxRow
              key={row.id}
              id={row.id}
              label={row.label}
              hidden={row.hidden}
              onToggle={(visible) => toggle(row.id, visible)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableInboxRow({
  id,
  label,
  hidden,
  onToggle,
}: {
  id: string;
  label: string;
  hidden: boolean;
  onToggle: (visible: boolean) => void;
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'bg-background flex items-center gap-1.5 text-[13px]',
        isDragging && 'relative z-10 opacity-80',
      )}
    >
      <button
        type="button"
        // listeners/attributes はハンドルのみ → Switch は独立してクリックできる
        {...attributes}
        {...listeners}
        aria-label={t('dragToReorder')}
        className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab touch-none active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </button>
      <span className={cn('flex-1 truncate', hidden && 'text-muted-foreground line-through')}>
        {label}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        aria-label={t('toggleSectionVisibility', label)}
        aria-pressed={!hidden}
        onClick={() => onToggle(hidden)}
      >
        {hidden ? (
          <EyeOff className="text-muted-foreground size-3.5" />
        ) : (
          <Eye className="size-3.5" />
        )}
      </Button>
    </div>
  );
}

/**
 * グループに割り当てたセクションの順序付きリスト。並び順はタブグループ内の
 * 表示順に直結する（ソート未指定時）ため、↑↓で並べ替えられる。
 * 追加は未割当セクションの Select（value は常に空 = プレースホルダ表示）。
 */
function GroupSectionList({
  sectionIds,
  sections,
  onChange,
}: {
  sectionIds: string[];
  sections: { id: string; label: string }[];
  onChange: (next: string[]) => void;
}): React.JSX.Element {
  const labelById = new Map(sections.map((i) => [i.id, i.label]));
  const unassigned = sections.filter((i) => !sectionIds.includes(i.id));
  const move = (idx: number, delta: -1 | 1): void => {
    const next = [...sectionIds];
    const [item] = next.splice(idx, 1);
    next.splice(idx + delta, 0, item!);
    onChange(next);
  };

  return (
    <div className="space-y-1">
      {sectionIds.map((id, idx) => (
        <div key={id} className="flex items-center gap-1 text-[13px]">
          <span className="text-muted-foreground w-4 shrink-0 text-right font-mono text-[10px]">
            {idx + 1}
          </span>
          {/* 削除済みカスタムセクションへの残存参照は生の id を出す（気付けるように） */}
          <span className="flex-1 truncate">{labelById.get(id) ?? id}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={t('moveUp')}
            disabled={idx === 0}
            onClick={() => move(idx, -1)}
          >
            <ChevronUp className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={t('moveDown')}
            disabled={idx === sectionIds.length - 1}
            onClick={() => move(idx, 1)}
          >
            <ChevronDown className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={t('removeSection')}
            onClick={() => onChange(sectionIds.filter((x) => x !== id))}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
      {unassigned.length > 0 && (
        <Select value="" onValueChange={(id) => onChange([...sectionIds, id])}>
          <SelectTrigger
            size="sm"
            className="text-muted-foreground h-7 w-full border-dashed text-[11px]"
          >
            <span className="flex items-center gap-1">
              <Plus className="size-3" />
              {t('addSection')}
            </span>
          </SelectTrigger>
          <SelectContent>
            {unassigned.map((section) => (
              <SelectItem key={section.id} value={section.id}>
                {section.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function ForceAlignButton(): React.JSX.Element {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={state === 'running'}
      onClick={() => {
        setState('running');
        void sendMessage<{ ok: boolean }>({ type: 'FORCE_SYNC' }).then(() => {
          setState('done');
          setTimeout(() => setState('idle'), 1500);
        });
      }}
    >
      {state === 'running' ? (
        <Loader2 className="size-3 animate-spin" />
      ) : state === 'done' ? (
        <Check className="size-3 text-emerald-500" />
      ) : (
        <Zap className="size-3" />
      )}
      {t('forceAlignNow')}
    </Button>
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
  className?: string;
  onCommit: (v: string) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(props.value);
  return (
    <Input
      type="text"
      className={cn('h-7 text-xs', props.className)}
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
