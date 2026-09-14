"use client";

import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { errorMessage } from "./api";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (updater: T | ((prev: T | null) => T | null)) => void;
}

/**
 * Small data-fetching hook: runs `fn` on mount and whenever `deps` change.
 * Handles loading / error states and ignores stale responses.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList, enabled = true): AsyncState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    fn()
      .then((result) => {
        if (latest.current === id) setDataState(result);
      })
      .catch((err: unknown) => {
        if (latest.current === id) setError(errorMessage(err));
      })
      .finally(() => {
        if (latest.current === id) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((updater: T | ((prev: T | null) => T | null)) => {
    setDataState((prev) => (typeof updater === "function" ? (updater as (p: T | null) => T | null)(prev) : updater));
  }, []);

  return { data, loading, error, reload, setData };
}

export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

export interface Flash {
  kind: "success" | "error";
  message: string;
}

/** Inline toast-like message that auto-clears. */
export function useFlash(timeout = 4000): [Flash | null, (flash: Flash | null) => void] {
  const [flash, setFlashState] = useState<Flash | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setFlash = useCallback(
    (next: Flash | null) => {
      if (timer.current) clearTimeout(timer.current);
      setFlashState(next);
      if (next && timeout > 0) timer.current = setTimeout(() => setFlashState(null), timeout);
    },
    [timeout],
  );
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return [flash, setFlash];
}
