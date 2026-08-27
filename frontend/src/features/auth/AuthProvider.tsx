import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { authStorage } from '../../lib/authStorage';
import { setUnauthorizedHandler } from '../../lib/apiClient';
import { decodeJwt, isExpired } from './jwt';
import { login as loginRequest } from './api';
import type { AuthContextValue, AuthUser } from './types';

export const AuthContext = createContext<AuthContextValue | null>(null);

function userFromToken(token: string): AuthUser | null {
  const claims = decodeJwt(token);
  if (!claims || isExpired(claims)) return null;
  return {
    userId: claims.userId,
    role: claims.role,
    patientId: claims.patientId,
    doctorId: claims.doctorId
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const signOut = useCallback(() => {
    authStorage.clearToken();
    setUser(null);
  }, []);

  useEffect(() => {
    const existingToken = authStorage.getToken();
    if (existingToken) {
      const nextUser = userFromToken(existingToken);
      if (nextUser) setUser(nextUser);
      else authStorage.clearToken();
    }
    setIsInitializing(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(signOut);
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { token } = await loginRequest(email, password);
    const nextUser = userFromToken(token);
    if (!nextUser) throw new Error('Received an invalid session token.');
    authStorage.setToken(token);
    setUser(nextUser);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isInitializing,
      signIn,
      signOut
    }),
    [user, isInitializing, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
