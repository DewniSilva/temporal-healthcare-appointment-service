import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultBackoff, delayForAttempt, type BackoffOptions } from '../polling';

export type PollingStatus = 'idle' | 'polling' | 'done' | 'exhausted';

export interface UsePollingOptions<T> {
  fetcher: (signal: AbortSignal) => Promise<T>;
  /** Return true once the polled value should stop being refetched. */
  isTerminal: (data: T) => boolean;
  /** Errors that mean "not ready yet" rather than a real failure (e.g. 404 right after booking). */
  isExpectedNotReady?: (error: unknown) => boolean;
  enabled: boolean;
  backoff?: BackoffOptions;
}

export interface UsePollingResult<T> {
  data: T | null;
  status: PollingStatus;
  attempt: number;
  error: unknown;
  retry: () => void;
}

/**
 * Bounded-backoff polling loop shared by the booking-processing screen and
 * the appointment detail page. Stops for good once isTerminal is true, or
 * pauses in an "exhausted" state after backoff.maxAttempts so the caller can
 * offer a manual retry instead of polling forever.
 */
export function usePolling<T>({
  fetcher,
  isTerminal,
  isExpectedNotReady,
  enabled,
  backoff = defaultBackoff
}: UsePollingOptions<T>): UsePollingResult<T> {
  const [state, setState] = useState<{
    data: T | null;
    status: PollingStatus;
    attempt: number;
    error: unknown;
  }>({ data: null, status: enabled ? 'polling' : 'idle', attempt: 0, error: null });

  const generationRef = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const isTerminalRef = useRef(isTerminal);
  isTerminalRef.current = isTerminal;
  const isExpectedRef = useRef(isExpectedNotReady);
  isExpectedRef.current = isExpectedNotReady;

  const start = useCallback(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    const controller = new AbortController();
    setState({ data: null, status: 'polling', attempt: 0, error: null });

    const runAttempt = async (attempt: number): Promise<void> => {
      if (generation !== generationRef.current) return;
      try {
        const data = await fetcherRef.current(controller.signal);
        if (generation !== generationRef.current) return;

        if (isTerminalRef.current(data)) {
          setState({ data, status: 'done', attempt, error: null });
          return;
        }
        if (attempt + 1 >= backoff.maxAttempts) {
          setState({ data, status: 'exhausted', attempt: attempt + 1, error: null });
          return;
        }
        setState({ data, status: 'polling', attempt: attempt + 1, error: null });
        window.setTimeout(() => void runAttempt(attempt + 1), delayForAttempt(attempt + 1, backoff));
      } catch (error) {
        if (generation !== generationRef.current) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;

        const expected = isExpectedRef.current?.(error) ?? false;
        if (attempt + 1 >= backoff.maxAttempts) {
          setState((prev) => ({ data: prev.data, status: 'exhausted', attempt: attempt + 1, error }));
          return;
        }
        setState((prev) => ({
          data: prev.data,
          status: 'polling',
          attempt: attempt + 1,
          error: expected ? null : error
        }));
        window.setTimeout(() => void runAttempt(attempt + 1), delayForAttempt(attempt + 1, backoff));
      }
    };

    void runAttempt(0);
    return () => controller.abort();
  }, [backoff]);

  useEffect(() => {
    if (!enabled) return;
    const abort = start();
    return () => {
      generationRef.current += 1;
      abort?.();
    };
  }, [enabled, start]);

  const retry = useCallback(() => {
    start();
  }, [start]);

  return { ...state, retry };
}
