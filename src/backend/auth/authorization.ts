import type { AppointmentStatus } from '@prisma/client';
import type { AuthenticatedUser } from './auth.service';
import { AppError } from '../api/errors';

export interface AppointmentAccessRecord {
  id: string;
  patientId: string;
  doctorId: string;
  status: AppointmentStatus;
}

export function assertCanCreate(user: AuthenticatedUser, patientId: string): void {
  if (user.role === 'ADMIN') return;
  if (user.role !== 'PATIENT' || user.patientId !== patientId) {
    throw new AppError(403, 'FORBIDDEN', 'You cannot create this appointment.');
  }
}

export function assertCanRead(user: AuthenticatedUser, appointment: AppointmentAccessRecord): void {
  if (user.role === 'ADMIN') return;
  if (user.role === 'PATIENT' && user.patientId === appointment.patientId) return;
  if (user.role === 'DOCTOR' && user.doctorId === appointment.doctorId) return;
  throw new AppError(403, 'FORBIDDEN', 'You cannot access this appointment.');
}

export function assertCanAct(user: AuthenticatedUser, appointment: AppointmentAccessRecord): void {
  if (user.role === 'ADMIN') return;
  if (user.role === 'PATIENT' && user.patientId === appointment.patientId) return;
  throw new AppError(403, 'FORBIDDEN', 'You cannot modify this appointment.');
}

/** For doctor/admin-only actions (mark completed / mark no-show). */
export function assertCanManage(user: AuthenticatedUser, appointment: AppointmentAccessRecord): void {
  if (user.role === 'ADMIN') return;
  if (user.role === 'DOCTOR' && user.doctorId === appointment.doctorId) return;
  throw new AppError(403, 'FORBIDDEN', 'You cannot manage this appointment.');
}

/** For managing a doctor's own recurring availability/schedule exceptions. */
export function assertCanManageDoctorSchedule(user: AuthenticatedUser, doctorId: string): void {
  if (user.role === 'ADMIN') return;
  if (user.role === 'DOCTOR' && user.doctorId === doctorId) return;
  throw new AppError(403, 'FORBIDDEN', 'You cannot manage this doctor\'s schedule.');
}
