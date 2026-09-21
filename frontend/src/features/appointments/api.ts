import { apiRequest } from '../../lib/apiClient';
import type {
  Appointment,
  AppointmentListQuery,
  AppointmentListResponse,
  AppointmentWorkflowState,
  AvailableSlotsResponse,
  CreateAppointmentRequest,
  SignalResponse,
  StartAppointmentResponse
} from '../../types/api';

export function getAppointments(query: AppointmentListQuery = {}, signal?: AbortSignal): Promise<AppointmentListResponse> {
  const params = new URLSearchParams();
  if (query.status?.length) params.set('status', query.status.join(','));
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.doctorId) params.set('doctorId', query.doctorId);
  if (query.patientId) params.set('patientId', query.patientId);
  if (query.view) params.set('view', query.view);
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.limit) params.set('limit', String(query.limit));
  if (query.sort) params.set('sort', query.sort);
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return apiRequest<AppointmentListResponse>(`/appointments${suffix}`, { signal });
}

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
