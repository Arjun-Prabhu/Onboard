/**
 * @file Re-runs a callback when the person comes back to this tab or window, so a screen shows
 * what other people changed meanwhile (for example a role change made by someone else).
 */
import { useEffect, useRef } from 'react';

/** Coming back sooner than this after the last refresh doesn't refresh again. */
const MIN_GAP_MS = 5_000;

/**
 * Calls `refresh` when the tab becomes visible or the window gets focus again.
 * @param refresh - What to reload.
 */
export function useRefreshOnReturn(refresh: () => void): void {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    let last = Date.now();
    const onReturn = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < MIN_GAP_MS) return;
      last = Date.now();
      latest.current();
    };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, []);
}
