// Small storage abstraction so the persistence mechanism (sessionStorage for
// this demo) can be swapped later without touching call sites.

const TOKEN_KEY = 'healthcare.auth.token';

export interface AuthStorage {
  getToken(): string | null;
  setToken(token: string): void;
  clearToken(): void;
}

export const sessionAuthStorage: AuthStorage = {
  getToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  setToken(token: string) {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Storage may be unavailable (private browsing, quota); the session
      // simply will not persist across a reload in that case.
    }
  },
  clearToken() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // Nothing to do if storage is unavailable.
    }
  }
};

export const authStorage = sessionAuthStorage;
