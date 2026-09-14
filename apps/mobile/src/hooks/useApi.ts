import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/lib/api";

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
}

/**
 * Small data-fetching hook: runs `fetcher` on mount (and whenever `deps`
 * change), exposes loading / refreshing / error states plus `reload`.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: ReadonlyArray<unknown> = [], enabled = true) {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: enabled,
    refreshing: false,
    error: null,
  });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const requestId = useRef(0);

  const run = useCallback(
    async (mode: "initial" | "refresh" | "silent") => {
      const id = ++requestId.current;
      setState((s) => ({
        ...s,
        loading: mode === "initial" ? true : s.loading && s.data === null,
        refreshing: mode === "refresh",
        error: mode === "silent" ? s.error : null,
      }));
      try {
        const data = await fetcherRef.current();
        if (id !== requestId.current) return;
        setState({ data, loading: false, refreshing: false, error: null });
      } catch (err) {
        if (id !== requestId.current) return;
        setState((s) => ({ ...s, loading: false, refreshing: false, error: getErrorMessage(err) }));
      }
    },
    [],
  );

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, loading: false, refreshing: false, error: null });
      return;
    }
    run("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  const reload = useCallback(() => run("initial"), [run]);
  const refresh = useCallback(() => run("refresh"), [run]);
  const silentReload = useCallback(() => run("silent"), [run]);
  const setData = useCallback((updater: T | ((prev: T | null) => T | null)) => {
    setState((s) => ({
      ...s,
      data: typeof updater === "function" ? (updater as (prev: T | null) => T | null)(s.data) : updater,
    }));
  }, []);

  return { ...state, reload, refresh, silentReload, setData };
}
