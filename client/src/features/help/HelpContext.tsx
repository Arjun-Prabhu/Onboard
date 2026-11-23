/**
 * @file Help state: the Help panel (screen help + assistant; F1 opens it) and the tour.
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

/** Values exposed by {@link useHelp}. */
export interface HelpApi {
  openHelp: () => void;
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  tourOpen: boolean;
  startTour: () => void;
  endTour: () => void;
}

const HelpContext = createContext<HelpApi | null>(null);

/**
 * Provides help state and renders the context-help dialog.
 * F1 opens help for the current screen (FR-31).
 * @param props - Children.
 * @returns The provider.
 */
export function HelpProvider({ children }: { children: ReactNode }) {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setAssistantOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openHelp = useCallback(() => setAssistantOpen(true), []);
  const startTour = useCallback(() => setTourOpen(true), []);
  const endTour = useCallback(() => setTourOpen(false), []);
  const value = useMemo(
    () => ({ openHelp, assistantOpen, setAssistantOpen, tourOpen, startTour, endTour }),
    [openHelp, assistantOpen, tourOpen, startTour, endTour],
  );

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

/**
 * Access help state.
 * @returns The help API.
 * @throws Error when used outside {@link HelpProvider}.
 */
export function useHelp(): HelpApi {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error('useHelp must be used inside HelpProvider');
  return ctx;
}
