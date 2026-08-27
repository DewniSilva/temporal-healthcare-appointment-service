import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';
import { apiRequest } from '../../lib/apiClient';
import { ApiError } from '../../lib/apiError';
import * as authApi from './api';

function makeToken(payload: Record<string, unknown>): string {
  const base64Url = (input: object) =>
    btoa(JSON.stringify(input)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url(payload)}.signature`;
}

const validToken = makeToken({
  userId: 'user-1',
  role: 'PATIENT',
  patientId: 'patient-001',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600
});

const expiredToken = makeToken({
  userId: 'user-1',
  role: 'PATIENT',
  patientId: 'patient-001',
  iat: 0,
  exp: 1
});

function TestConsumer() {
  const { user, isAuthenticated, isInitializing, signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const attemptSignIn = async () => {
    try {
      await signIn('patient1@example.test', 'DemoPass123!');
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  return (
    <div>
      <p data-testid="status">
        {isInitializing ? 'initializing' : isAuthenticated ? 'authenticated' : 'anonymous'}
      </p>
      <p data-testid="role">{user?.role ?? ''}</p>
      <button onClick={attemptSignIn}>sign in</button>
      {error && <p data-testid="error">{error}</p>}
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('signs in successfully and exposes the decoded user', async () => {
    vi.spyOn(authApi, 'login').mockResolvedValue({ token: validToken, expiresIn: '1h' });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
    fireEvent.click(screen.getByText('sign in'));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('PATIENT');
  });

  it('surfaces a login failure without authenticating', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValue(
      new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.')
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    fireEvent.click(screen.getByText('sign in'));

    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('Email or password is incorrect.'));
    expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
  });

  it('clears an expired stored token on initialization', async () => {
    sessionStorage.setItem('healthcare.auth.token', expiredToken);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
    expect(sessionStorage.getItem('healthcare.auth.token')).toBeNull();
  });

  it('signs out automatically when the API reports a 401', async () => {
    vi.spyOn(authApi, 'login').mockResolvedValue({ token: validToken, expiresIn: '1h' });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    fireEvent.click(screen.getByText('sign in'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'INVALID_TOKEN', message: 'Expired.' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        })
      )
    );

    await expect(apiRequest('/appointments/abc')).rejects.toBeInstanceOf(ApiError);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
  });
});
