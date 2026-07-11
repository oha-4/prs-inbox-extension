import { useSettings } from '../popup/hooks/useSettings';
import { SettingsView } from '../popup/views/SettingsView';

export function App(): React.JSX.Element {
  const { settings, update, saveError } = useSettings();
  // settings 読み込みは一瞬なので、それまでは背景色だけの空画面を出す
  if (!settings) return <div className="bg-background min-h-screen" aria-hidden />;

  return (
    <div className="bg-background text-foreground min-h-screen">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center gap-2.5 px-3.5 py-3">
          <span className="bg-signal signal-led size-2 shrink-0 rounded-full" aria-hidden />
          <span className="font-sans text-[15px] leading-none font-bold tracking-[-0.01em]">
            PRs<span className="text-signal">.</span>Inbox
          </span>
        </header>
        <SettingsView settings={settings} update={update} saveError={saveError} />
      </div>
    </div>
  );
}
