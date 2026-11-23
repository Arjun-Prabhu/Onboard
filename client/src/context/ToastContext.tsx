/**
 * @file Toast notifications announced through an `aria-live` region.
 */
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Toast kinds. */
export type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

/** API exposed by {@link useToast}. */
export interface ToastApi {
  /** Shows a toast for a few seconds. */
  show: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** How long a toast stays visible. Errors linger so they can be read. */
const DURATION_MS: Record<ToastKind, number> = { success: 4000, info: 5000, error: 7000 };

/**
 * Provides toasts to the app.
 * @param props - Children.
 * @returns Provider with the toast region.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-3), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), DURATION_MS[kind]);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ show }), [show]);
  const icons = { success: CheckCircle2, error: XCircle, info: Info };
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100%-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => {
          const Icon = icons[t.kind];
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className={cn(
                'animate-pop pointer-events-auto flex items-start gap-3 rounded-panel border bg-surface p-3 text-sm text-ink shadow-lg',
                t.kind === 'error'
                  ? 'border-bad'
                  : t.kind === 'success'
                    ? 'border-good'
                    : 'border-primary',
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 size-5 shrink-0',
                  t.kind === 'error'
                    ? 'text-bad'
                    : t.kind === 'success'
                      ? 'text-good'
                      : 'text-primary',
                )}
                aria-hidden
              />
              <p className="flex-1">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="rounded p-0.5 text-ink-muted hover:text-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Access the toast API.
 * @returns The toast API.
 * @throws Error when used outside {@link ToastProvider}.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
