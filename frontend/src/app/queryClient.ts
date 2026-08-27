import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../lib/apiError';

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    // Auth/permission/validation/conflict errors will not resolve by retrying.
    if ([400, 401, 403, 404, 409].includes(error.status)) return false;
  }
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      refetchOnWindowFocus: false,
      staleTime: 10_000
    },
    mutations: {
      retry: false
    }
  }
});
