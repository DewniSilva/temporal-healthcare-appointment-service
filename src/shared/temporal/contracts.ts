export const TASK_QUEUE = 'healthcare-appointments';

export interface AppointmentBookingInput {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  appointmentTime: string;
  reminderLeadTimeSeconds: number;
}

export interface AppointmentReminderInput {
  appointmentId: string;
  appointmentTime: string;
  reminderLeadTimeSeconds: number;
}

// Lets the backend start the registered Workflow by name without importing
// worker implementation code across the service boundary.
export type AppointmentBookingWorkflow = (
  input: AppointmentBookingInput
) => Promise<AppointmentWorkflowState>;

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
}

export interface AppointmentActivityInput {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  appointmentTime: string;
}

export interface StatusUpdateInput {
  appointmentId: string;
  status: 'CONFIRMED' | 'CANCELLED';
}

export interface NotificationInput {
  appointmentId: string;
}

export interface AppointmentActivities {
  validateAppointmentRequest(input: AppointmentActivityInput): Promise<void>;
  checkDoctorAvailability(input: AppointmentActivityInput): Promise<void>;
  reserveAppointmentSlot(input: AppointmentActivityInput): Promise<void>;
  releaseAppointmentSlot(input: { appointmentId: string }): Promise<void>;
  createAppointment(input: AppointmentActivityInput): Promise<void>;
  sendBookingConfirmation(input: NotificationInput): Promise<void>;
  sendAppointmentReminder(input: NotificationInput): Promise<void>;
  updateAppointmentStatus(input: StatusUpdateInput): Promise<void>;
}

export const bookingWorkflowId = (appointmentId: string): string => `appointment-${appointmentId}`;
export const reminderWorkflowId = (appointmentId: string): string => `appointment-reminder-${appointmentId}`;
