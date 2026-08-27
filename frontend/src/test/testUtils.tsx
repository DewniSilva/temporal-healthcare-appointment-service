import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/ToastProvider';
import { AuthContext } from '../features/auth/AuthProvider';
import type { AuthContextValue, AuthUser } from '../features/auth/types';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
}

export function makeAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return { userId: 'user-1', role: 'PATIENT', patientId: 'patient-001', ...overrides };
}

export function makeAuthContextValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: makeAuthUser(),
    isAuthenticated: true,
    isInitializing: false,
    signIn: vi_noop,
    signOut: vi_noop_void,
    ...overrides
  };
}

// Kept as plain no-ops (rather than importing vi in this non-test module) so
// this file can be imported from both test files and, if ever needed, from
// story-style previews without pulling in the test runner globals.
function vi_noop(): Promise<void> {
  return Promise.resolve();
}
function vi_noop_void(): void {
  // no-op
}

interface RenderProvidersProps {
  children: ReactNode;
  authValue?: AuthContextValue | null;
  initialEntries?: string[];
  queryClient?: QueryClient;
}

export function TestProviders({
  children,
  authValue,
  initialEntries = ['/'],
  queryClient
}: RenderProvidersProps) {
  const client = queryClient ?? createTestQueryClient();
  const body = (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );

  if (authValue === null) return body;
  return <AuthContext.Provider value={authValue ?? makeAuthContextValue()}>{body}</AuthContext.Provider>;
}
