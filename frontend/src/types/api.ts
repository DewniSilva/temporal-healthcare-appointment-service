// Types mirror src/shared/temporal/contracts.ts and the backend DTOs exactly.
// Do not add fields the backend does not actually return.

export type UserRole = 'PATIENT' | 'DOCTOR' | 'ADMIN';

export interface LoginResponse {
  token: string;
  expiresIn: string;
}

export type AppointmentStatus = 'PENDING' | 'BOOKED' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  appointmentTime: string;
  status: AppointmentStatus;
  createdAt: string;
  updatedAt: string;
}

export type WorkflowStatus =
  | 'BOOKING'
  | 'SCHEDULED'
  | 'WAITING_FOR_CONFIRMATION'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'FAILED';

export interface AppointmentWorkflowState {
  status: WorkflowStatus;
  reminderSent: boolean;
  confirmed: boolean;
  cancelled: boolean;
  reminderAt: string;
}

export interface StartAppointmentResponse {
  appointmentId: string;
  workflowId: string;
  status: 'STARTED' | 'ALREADY_STARTED';
}

export interface SignalResponse {
  appointmentId: string;
  status: 'CONFIRM_SIGNAL_ACCEPTED' | 'CANCEL_SIGNAL_ACCEPTED';
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

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
