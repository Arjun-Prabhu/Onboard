/**
 * @file Accessibility settings (NFR-4, §2.10): theme, text size, dyslexia-friendly font,
 * reduced motion. Applied as `data-*` attributes on `<html>` so CSS does the work, and saved
 * to localStorage so they persist between launches.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/** Color themes. */
export type Theme = 'light' | 'dark' | 'contrast';

/** All accessibility settings. */
export interface A11ySettings {
  theme: Theme;
  /** Text scale multiplier, 0.9 – 1.5. */
  fontScale: number;
  dyslexiaFont: boolean;
  reduceMotion: boolean;
}

/** Defaults. Theme follows the OS on first run. */
export const DEFAULT_SETTINGS: A11ySettings = {
  theme:
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
  fontScale: 1,
  dyslexiaFont: false,
  reduceMotion:
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
};

/** Allowed text-scale steps shown in Settings. */
export const FONT_SCALES = [0.9, 1, 1.15, 1.3, 1.5] as const;

const STORAGE_KEY = 'onboard.a11y';

/** Values exposed by {@link useA11y}. */
export interface A11yApi {
  settings: A11ySettings;
  update: (patch: Partial<A11ySettings>) => void;
  reset: () => void;
}

const A11yContext = createContext<A11yApi | null>(null);

/**
 * Loads saved settings, falling back to defaults on any problem.
 * @returns Settings.
 */
function load(): A11ySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<A11ySettings>) }
      : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Provides accessibility settings and applies them to the document.
 * @param props - Children.
 * @returns The provider.
 */
export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<A11ySettings>(load);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.font = settings.dyslexiaFont ? 'dyslexia' : 'default';
    root.dataset.motion = settings.reduceMotion ? 'reduce' : 'full';
    root.style.setProperty('--rh-scale', String(settings.fontScale));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Non-fatal: settings still apply for this session.
    }
  }, [settings]);

  const update = useCallback(
    (patch: Partial<A11ySettings>) => setSettings((s) => ({ ...s, ...patch })),
    [],
  );
  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);
  const value = useMemo(() => ({ settings, update, reset }), [settings, update, reset]);
  return <A11yContext.Provider value={value}>{children}</A11yContext.Provider>;
}

/**
 * Access accessibility settings.
 * @returns The settings API.
 * @throws Error when used outside {@link AccessibilityProvider}.
 */
export function useA11y(): A11yApi {
  const ctx = useContext(A11yContext);
  if (!ctx) throw new Error('useA11y must be used inside AccessibilityProvider');
  return ctx;
}
