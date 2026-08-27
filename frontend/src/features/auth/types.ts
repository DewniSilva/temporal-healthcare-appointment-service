import type { UserRole } from '../../types/api';

export interface AuthUser {
  userId: string;
  role: UserRole;
  patientId?: string;
  doctorId?: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}
