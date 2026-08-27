import type { AuthUser } from '../auth/types';
import type { Appointment } from '../../types/api';

// Mirrors src/backend/auth/authorization.ts for UI display decisions only.
// The backend re-checks every action and remains the sole authority; a wrong
// guess here only shows/hides a button, it never grants real access.

export function canActOnAppointment(user: AuthUser, appointment: Appointment): boolean {
  if (user.role === 'ADMIN') return true;
  if (user.role === 'PATIENT') return user.patientId === appointment.patientId;
  return false;
}

export function canCreateForPatient(user: AuthUser, patientId: string): boolean {
  if (user.role === 'ADMIN') return true;
  return user.role === 'PATIENT' && user.patientId === patientId;
}
