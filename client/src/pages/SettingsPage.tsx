/**
 * @file Settings: accessibility preferences (NFR-4) and, for admins, demo-data reset (FR-3).
 */
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { messageOf } from '@shared/errors';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Form';
import { PageHeader, Panel } from '@/components/Layout';
import { ConfirmDialog } from '@/components/Modal';
import { Badge } from '@/components/Status';
import { FONT_SCALES, useA11y, type Theme } from '@/context/AccessibilityContext';
import { useAuth, useUser } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

const THEMES: Array<{ id: Theme; label: string; description: string }> = [
  { id: 'light', label: 'Light', description: 'Default' },
  { id: 'dark', label: 'Dark', description: 'Easier in low light' },
  { id: 'contrast', label: 'High contrast', description: 'Maximum legibility' },
];

/**
 * The settings page.
 * @returns The page.
 */
export default function SettingsPage() {
  const user = useUser();
  const { refresh } = useAuth();
  const { reload: reloadOrgs } = useOrg();
  const { settings, update, reset } = useA11y();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = useAsync(() => api.meta.status(), []);
  const canReset = status.data?.demoMode === true;

  /** Resets demo data and reloads the app state. */
  const resetDemo = async () => {
    setBusy(true);
    try {
      await api.meta.resetDemo();
      await refresh();
      await reloadOrgs();
      toast.show('Demo data restored.');
      setConfirm(false);
    } catch (err) {
      toast.show(messageOf(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="App settings" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Theme">
          <fieldset>
            <legend className="sr-only">Color theme</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {THEMES.map((t) => (
                <label
                  key={t.id}
                  className={cn(
                    'cursor-pointer rounded-panel border-2 p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus',
                    settings.theme === t.id ? 'border-primary bg-primary-soft' : 'border-line',
                  )}
                >
                  <input
                    type="radio"
                    name="theme"
                    className="sr-only"
                    checked={settings.theme === t.id}
                    onChange={() => update({ theme: t.id })}
                  />
                  <span className="block font-semibold">{t.label}</span>
                  <span className="block text-sm text-ink-muted">{t.description}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </Panel>

        <Panel title="Text size">
          <fieldset>
            <legend className="sr-only">Text size</legend>
            <div className="flex flex-wrap gap-2">
              {FONT_SCALES.map((s) => (
                <label
                  key={s}
                  className={cn(
                    'grid min-h-12 min-w-14 cursor-pointer place-items-center rounded-control border-2 px-3 font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus',
                    settings.fontScale === s
                      ? 'border-primary bg-primary-soft text-primary'
                      : 'border-line',
                  )}
                >
                  <input
                    type="radio"
                    name="scale"
                    className="sr-only"
                    checked={settings.fontScale === s}
                    onChange={() => update({ fontScale: s })}
                  />
                  <span style={{ fontSize: `${s}rem` }}>A</span>
                  <span className="text-xs">{Math.round(s * 100)}%</span>
                </label>
              ))}
            </div>
          </fieldset>
        </Panel>

        <Panel title="Reading & motion">
          <div className="space-y-4">
            <Checkbox
              label="Dyslexia-friendly font"
              description="Switches to Atkinson Hyperlegible, designed for clearer letter shapes."
              checked={settings.dyslexiaFont}
              onChange={(c) => update({ dyslexiaFont: c })}
            />
            <Checkbox
              label="Reduce motion"
              description="Turns off animations and transitions."
              checked={settings.reduceMotion}
              onChange={(c) => update({ reduceMotion: c })}
            />
            <Button variant="ghost" size="sm" onClick={reset}>
              Restore default settings
            </Button>
          </div>
        </Panel>

        <Panel title="About">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="font-semibold">Signed in as</dt>
              <dd className="text-ink-muted">{user.email}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-semibold">Version</dt>
              <dd className="text-ink-muted">{__APP_VERSION__}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-semibold">Data source</dt>
              <dd>
                <Badge tone={canReset ? 'warn' : 'good'}>
                  {canReset ? 'Local database · demo mode' : 'Local database'}
                </Badge>
              </dd>
            </div>
          </dl>
          {canReset && (
            <div className="mt-5 border-t border-line pt-4">
              <Button
                variant="secondary"
                icon={<RotateCcw className="size-4" aria-hidden />}
                onClick={() => setConfirm(true)}
              >
                Reset demo data
              </Button>
              <p className="mt-1 text-xs text-ink-muted">
                Restores the sample sites, volunteers, and sessions.
              </p>
            </div>
          )}
        </Panel>
      </div>
      <ConfirmDialog
        open={confirm}
        danger
        title="Reset all demo data?"
        message="Every change made since the app was installed will be replaced with the original sample data."
        confirmLabel="Reset data"
        loading={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void resetDemo()}
      />
    </>
  );
}
