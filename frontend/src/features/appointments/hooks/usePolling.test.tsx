import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePolling } from './usePolling';

// Tiny, real-time backoff so tests stay fast without fighting fake timers.
const fastBackoff = { initialDelayMs: 1, maxDelayMs: 2, factor: 1, maxAttempts: 4 };

class NotReadyError extends Error {}

describe('usePolling', () => {
  it('treats an expected "not ready" error as transient and keeps polling until success', async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new NotReadyError('not ready yet');
      return { value: 'found' };
    });

    const { result } = renderHook(() =>
      usePolling({
        fetcher,
        isTerminal: () => true,
        isExpectedNotReady: (error) => error instanceof NotReadyError,
        enabled: true,
        backoff: fastBackoff
      })
    );

    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.data).toEqual({ value: 'found' });
    expect(result.current.error).toBeNull();
    expect(calls).toBe(3);
  });

  it('never issues another fetch once a terminal result is reached', async () => {
    const fetcher = vi.fn(async () => ({ status: 'CONFIRMED' as const }));

    const { result } = renderHook(() =>
      usePolling({
        fetcher,
        isTerminal: (data) => data.status === 'CONFIRMED',
        enabled: true,
        backoff: fastBackoff
      })
    );

    await waitFor(() => expect(result.current.status).toBe('done'));
    const callsAtDone = fetcher.mock.calls.length;

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetcher.mock.calls.length).toBe(callsAtDone);
  });

  it('stops after maxAttempts and reports "exhausted" instead of polling forever', async () => {
    const fetcher = vi.fn(async (): Promise<{ status: 'WAITING_FOR_CONFIRMATION' | 'CONFIRMED' }> => ({
      status: 'WAITING_FOR_CONFIRMATION'
    }));

    const { result } = renderHook(() =>
      usePolling({
        fetcher,
        isTerminal: (data) => data.status === 'CONFIRMED',
        enabled: true,
        backoff: fastBackoff
      })
    );

    await waitFor(() => expect(result.current.status).toBe('exhausted'));
    expect(fetcher.mock.calls.length).toBe(fastBackoff.maxAttempts);

    const callsAtExhausted = fetcher.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetcher.mock.calls.length).toBe(callsAtExhausted);
  });

  it('resumes polling from attempt zero when retry() is called', async () => {
    const fetcher = vi.fn(async (): Promise<{ status: 'WAITING_FOR_CONFIRMATION' | 'CONFIRMED' }> => ({
      status: 'WAITING_FOR_CONFIRMATION'
    }));

    const { result } = renderHook(() =>
      usePolling({
        fetcher,
        isTerminal: (data) => data.status === 'CONFIRMED',
        enabled: true,
        backoff: fastBackoff
      })
    );

    await waitFor(() => expect(result.current.status).toBe('exhausted'));
    const callsBeforeRetry = fetcher.mock.calls.length;

    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThan(callsBeforeRetry));
  });
});
