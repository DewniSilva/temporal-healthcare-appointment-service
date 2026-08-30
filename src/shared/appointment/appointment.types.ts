export type AppointmentStatus =
  | 'REQUESTED'
  | 'RESERVING'
  | 'BOOKED'
  | 'CONFIRMED'
  | 'NO_RESPONSE'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'REJECTED'
  | 'BOOKING_FAILED';

export type ActorRole = 'PATIENT' | 'DOCTOR' | 'ADMIN' | 'SYSTEM';

export interface TransitionActor {
  actorId: string | null;
  actorRole: ActorRole;
}

export const TERMINAL_APPOINTMENT_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  'CANCELLED',
  'NO_RESPONSE',
  'COMPLETED',
  'NO_SHOW',
  'REJECTED',
  'BOOKING_FAILED'
]);

export function isTerminalAppointmentStatus(status: AppointmentStatus): boolean {
  return TERMINAL_APPOINTMENT_STATUSES.has(status);
}
