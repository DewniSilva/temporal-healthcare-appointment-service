import { apiRequest } from '../../lib/apiClient';
import type {
  Appointment,
  AppointmentWorkflowState,
  CreateAppointmentRequest,
  SignalResponse,
  StartAppointmentResponse
} from '../../types/api';

export function createAppointment(
  input: CreateAppointmentRequest,
  idempotencyKey: string
): Promise<StartAppointmentResponse> {
  return apiRequest<StartAppointmentResponse>('/appointments', {
    method: 'POST',
    body: input,
    idempotencyKey
  });
}

export function getAppointment(id: string, signal?: AbortSignal): Promise<Appointment> {
  return apiRequest<Appointment>(`/appointments/${id}`, { signal });
}

export function getWorkflowState(
  id: string,
  signal?: AbortSignal
): Promise<AppointmentWorkflowState> {
  return apiRequest<AppointmentWorkflowState>(`/appointments/${id}/workflow`, { signal });
}

export function confirmAppointment(id: string): Promise<SignalResponse> {
  return apiRequest<SignalResponse>(`/appointments/${id}/confirm`, { method: 'POST' });
}

export function cancelAppointment(id: string): Promise<SignalResponse> {
  return apiRequest<SignalResponse>(`/appointments/${id}/cancel`, { method: 'POST' });
}
