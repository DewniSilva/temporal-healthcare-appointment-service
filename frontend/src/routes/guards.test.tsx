import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleRoute } from './RoleRoute';
import { AuthContext } from '../features/auth/AuthProvider';
import { DashboardRedirect } from '../features/dashboard/DashboardRedirect';
import { makeAuthContextValue, makeAuthUser } from '../test/testUtils';
import type { AuthContextValue } from '../features/auth/types';

function renderWithAuth(auth: AuthContextValue, initialEntries: string[], routes: React.ReactNode) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>{routes}</Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('ProtectedRoute', () => {
  it('redirects to /login when the user is not authenticated', () => {
    renderWithAuth(
      makeAuthContextValue({ user: null, isAuthenticated: false }),
      ['/dashboard'],
      <>
        <Route path="/login" element={<p>login page</p>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<p>dashboard page</p>} />
        </Route>
      </>
    );

    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('renders the protected content when authenticated', () => {
    renderWithAuth(
      makeAuthContextValue({ user: makeAuthUser(), isAuthenticated: true }),
      ['/dashboard'],
      <>
        <Route path="/login" element={<p>login page</p>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<p>dashboard page</p>} />
        </Route>
      </>
    );

    expect(screen.getByText('dashboard page')).toBeInTheDocument();
  });

  it('shows a loading state while the session is initializing', () => {
    renderWithAuth(
      makeAuthContextValue({ isInitializing: true }),
      ['/dashboard'],
      <>
        <Route path="/login" element={<p>login page</p>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<p>dashboard page</p>} />
        </Route>
      </>
    );

    expect(screen.getByText(/loading your session/i)).toBeInTheDocument();
  });
});

describe('RoleRoute', () => {
  it('redirects to /unauthorized when the role does not match', () => {
    renderWithAuth(
      makeAuthContextValue({ user: makeAuthUser({ role: 'DOCTOR' }) }),
      ['/appointments/new'],
      <>
        <Route path="/unauthorized" element={<p>unauthorized page</p>} />
        <Route element={<RoleRoute allow={['PATIENT', 'ADMIN']} />}>
          <Route path="/appointments/new" element={<p>booking page</p>} />
        </Route>
      </>
    );

    expect(screen.getByText('unauthorized page')).toBeInTheDocument();
  });

  it('renders the content when the role matches', () => {
    renderWithAuth(
      makeAuthContextValue({ user: makeAuthUser({ role: 'ADMIN', patientId: undefined }) }),
      ['/appointments/new'],
      <>
        <Route path="/unauthorized" element={<p>unauthorized page</p>} />
        <Route element={<RoleRoute allow={['PATIENT', 'ADMIN']} />}>
          <Route path="/appointments/new" element={<p>booking page</p>} />
        </Route>
      </>
    );

    expect(screen.getByText('booking page')).toBeInTheDocument();
  });
});

describe('DashboardRedirect', () => {
  it.each([
    ['PATIENT', 'patient dashboard'],
    ['DOCTOR', 'doctor dashboard'],
    ['ADMIN', 'admin dashboard']
  ] as const)('sends a %s user to their role dashboard', (role, expectedText) => {
    renderWithAuth(
      makeAuthContextValue({ user: makeAuthUser({ role }) }),
      ['/dashboard'],
      <>
        <Route path="/dashboard" element={<DashboardRedirect />} />
        <Route path="/dashboard/patient" element={<p>patient dashboard</p>} />
        <Route path="/dashboard/doctor" element={<p>doctor dashboard</p>} />
        <Route path="/dashboard/admin" element={<p>admin dashboard</p>} />
      </>
    );

    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });
});
