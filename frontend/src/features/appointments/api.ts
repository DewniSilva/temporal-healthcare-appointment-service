import { apiRequest } from '../../lib/apiClient';
import type {
  Appointment,
  AppointmentWorkflowState,
  AvailableSlotsResponse,
  CreateAppointmentRequest,
  SignalResponse,
  StartAppointmentResponse
} from '../../types/api';

export function getAvailableSlots(
  doctorId: string,
  date: string,
  signal?: AbortSignal
): Promise<AvailableSlotsResponse> {
  const path = `/doctors/${encodeURIComponent(doctorId)}/available-slots?date=${encodeURIComponent(date)}`;
  return apiRequest<AvailableSlotsResponse>(path, { signal });
}

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

export function completeAppointment(id: string): Promise<SignalResponse> {
  return apiRequest<SignalResponse>(`/appointments/${id}/complete`, { method: 'POST' });
}

export function markNoShow(id: string): Promise<SignalResponse> {
  return apiRequest<SignalResponse>(`/appointments/${id}/no-show`, { method: 'POST' });
}
