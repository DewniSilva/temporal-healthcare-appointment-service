// Types mirror src/shared/temporal/contracts.ts and the backend DTOs exactly.
// Do not add fields the backend does not actually return.

export type UserRole = 'PATIENT' | 'DOCTOR' | 'ADMIN';

export interface LoginResponse {
  token: string;
  expiresIn: string;
}

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

export type ReservationStatus = 'RESERVING' | 'RESERVED' | 'RELEASED' | 'CONFLICTED';

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  appointmentTime: string;
  status: AppointmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentListItem {
  id: string;
  appointmentTime: string;
  status: AppointmentStatus;
  confirmedAt: string | null;
  updatedAt: string;
  patient: { id: string; displayName: string };
  doctor: { id: string; displayName: string };
  actionRequired: boolean;
}

export interface AppointmentListResponse {
  items: AppointmentListItem[];
  nextCursor: string | null;
  total: number;
}

export interface AppointmentListQuery {
  status?: AppointmentStatus[];
  from?: string;
  to?: string;
  doctorId?: string;
  patientId?: string;
  view?: 'today' | 'upcoming' | 'past' | 'action-required';
  cursor?: string;
  limit?: number;
  sort?: 'appointmentTime:asc' | 'appointmentTime:desc';
}

export interface AppointmentWorkflowState {
  appointmentStatus: AppointmentStatus;
  reservationStatus: ReservationStatus | null;
  confirmationReminderAt: string;
  confirmationDeadlineAt: string;
  upcomingReminderAt: string;
  confirmationReminderSent: boolean;
  upcomingReminderSent: boolean;
  confirmedAt: string | null;
}

export interface StartAppointmentResponse {
  appointmentId: string;
  workflowId: string;
  status: 'STARTED' | 'ALREADY_STARTED';
}

export interface SignalResponse {
  appointmentId: string;
  status: 'CONFIRM_SIGNAL_ACCEPTED' | 'CANCEL_SIGNAL_ACCEPTED' | 'COMPLETE_SIGNAL_ACCEPTED' | 'NO_SHOW_SIGNAL_ACCEPTED';
}

export interface HealthResponse {
  status: 'ok';
  database: 'ready';
  temporalClient: 'ready';
  redis: 'ready';
}

export interface CreateAppointmentRequest {
  patientId: string;
  doctorId: string;
  appointmentTime: string;
}

export type SlotStatus = 'AVAILABLE' | 'RESERVED' | 'PAST';

export interface AvailableSlot {
  startAt: string;
  endAt: string;
  status: SlotStatus;
}

export interface AvailableSlotsResponse {
  doctorId: string;
  date: string;
  slots: AvailableSlot[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
