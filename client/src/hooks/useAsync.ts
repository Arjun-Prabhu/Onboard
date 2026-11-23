/**
 * @file `useAsync` — loads data from the API with loading/error/reload state.
 */
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { messageOf } from '@shared/errors';
import { SIGNED_BACK_IN_EVENT } from '@/lib/api/httpApi';

/** State returned by {@link useAsync}. */
export interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  /** Re-runs the loader (e.g. after a mutation). */
  reload: () => void;
  /** Replaces the data locally without refetching. */
  setData: (next: T) => void;
}

/**
 * Runs an async loader on mount and whenever `deps` change.
 * Stale responses from earlier runs are ignored so fast filter changes can't flash old data.
 * @param loader - Function returning a promise of data.
 * @param deps - Dependencies that trigger a reload.
 * @returns Data, loading flag, friendly error message, and reload.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const runId = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader, deps);

  useEffect(() => {
    const id = ++runId.current;
    setLoading(true);
    setError(null);
    load()
      .then((d) => {
        if (id === runId.current) setData(d);
      })
      .catch((e: unknown) => {
        if (id === runId.current) setError(messageOf(e));
      })
      .finally(() => {
        if (id === runId.current) setLoading(false);
      });
  }, [load, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  // A screen that failed because the sign-in ran out loads again once the person signs back in.
  const failed = useRef(false);
  failed.current = error !== null;
  useEffect(() => {
    const retry = () => {
      if (failed.current) reload();
    };
    window.addEventListener(SIGNED_BACK_IN_EVENT, retry);
    return () => window.removeEventListener(SIGNED_BACK_IN_EVENT, retry);
  }, [reload]);

  return { data, loading, error, reload, setData };
}
