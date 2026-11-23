/**
 * @file First-run welcome per role (FR-30): three short cards, no more, so a first-time user
 * learns where to start without being overwhelmed.
 *
 * Each step points at an element tagged with `data-tour="<id>"`. The target is outlined with a
 * spotlight ring and the step card is placed beside it; if a target is hidden (e.g. the sidebar
 * on a phone) the card is simply centered. Esc or "Skip" ends it at any time.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { api } from '@/lib/api';
import { useHelp } from '../help/HelpContext';

/** One tour step. */
interface TourStep {
  target: string;
  title: string;
  body: string;
}

/** Three short cards for people who manage an org (shown on the Organize home page). */
const MANAGER_STEPS: TourStep[] = [
  {
    target: 'attention',
    title: 'Start here every day',
    body: 'This list shows only what needs you: sessions short on volunteers, hours to approve, people to follow up with. Each row has one button.',
  },
  {
    target: 'mode',
    title: 'Organize or volunteer',
    body: 'Use Organize to run your organization. Switch to Volunteer to see your own shifts and hours.',
  },
  {
    target: 'assistant',
    title: 'Stuck? Press Help',
    body: 'Help explains the screen you’re on and answers questions like “Who is free Tuesday?”',
  },
];

/** Three short cards for people who only volunteer. */
const VOLUNTEER_STEPS: TourStep[] = [
  {
    target: 'recommended',
    title: 'Shifts picked for you',
    body: 'These fit your skills and free times. Press Sign up and you’re on the list.',
  },
  {
    target: 'nav',
    title: 'Everything else is here',
    body: 'Find more shifts, see the ones you signed up for, and track your hours.',
  },
  {
    target: 'assistant',
    title: 'Stuck? Press Help',
    body: 'Help explains the screen you’re on and answers questions like “When is my next shift?”',
  },
];

/**
 * Finds the first VISIBLE element for a tour target.
 * @param target - `data-tour` value.
 * @returns The element, or null.
 */
function findTarget(target: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  return [...all].find((el) => el.offsetParent !== null) ?? null;
}

/**
 * The tour overlay. Starts automatically on a user's first sign-in.
 * @returns The overlay, or null when not running.
 */
export function Tour() {
  const { user, setUser } = useAuth();
  const { tourOpen, startTour, endTour } = useHelp();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { managed, loading } = useOrg();
  const steps = managed.length ? MANAGER_STEPS : VOLUNTEER_STEPS;
  const step = steps[index];

  // Auto-start for first-time users.
  useEffect(() => {
    if (user && !user.tourCompleted && !loading) startTour();
  }, [user, startTour, loading]);

  useLayoutEffect(() => {
    if (!tourOpen || !step) return;
    const el = findTarget(step.target);
    el?.scrollIntoView({ block: 'nearest' });
    const update = () => setRect(el ? el.getBoundingClientRect() : null);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [tourOpen, step]);

  useEffect(() => {
    if (tourOpen) cardRef.current?.focus();
  }, [tourOpen, index]);

  if (!tourOpen || !step || !user) return null;

  /** Ends the tour and remembers it was completed. */
  const finish = async () => {
    endTour();
    setIndex(0);
    if (!user.tourCompleted) {
      try {
        setUser(await api.auth.completeTour());
      } catch {
        // Non-fatal — the tour just shows again next time.
      }
    }
  };

  const cardStyle: React.CSSProperties = rect
    ? {
        top: Math.min(window.innerHeight - 220, rect.bottom + 12),
        left: Math.max(12, Math.min(window.innerWidth - 340, rect.left)),
      }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className="fixed inset-0 z-[60]" onKeyDown={(e) => e.key === 'Escape' && void finish()}>
      <div className="absolute inset-0 bg-black/45" aria-hidden onClick={() => void finish()} />
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-panel ring-4 ring-accent transition-all"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.25)',
          }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        className="animate-pop absolute w-80 rounded-panel border border-line bg-surface p-4 text-ink shadow-2xl"
        style={cardStyle}
      >
        <p className="text-xs font-semibold text-ink-muted">
          Step {index + 1} of {steps.length}
        </p>
        <h2 id="tour-title" className="mt-1 text-xl font-semibold">
          {step.title}
        </h2>
        <p id="tour-body" className="mt-1 text-sm text-ink-muted">
          {step.body}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => void finish()}>
            Skip
          </Button>
          <div className="flex gap-2">
            {index > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setIndex((i) => i - 1)}>
                Back
              </Button>
            )}
            {index < steps.length - 1 ? (
              <Button size="sm" onClick={() => setIndex((i) => i + 1)}>
                Next
              </Button>
            ) : (
              <Button size="sm" variant="accent" onClick={() => void finish()}>
                Finish
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
