import { apiRequest } from '../../lib/apiClient';
import type {
  Appointment,
  AppointmentListQuery,
  AppointmentListResponse,
  AppointmentSummary,
  AppointmentWorkflowState,
  AvailableSlotsResponse,
  DoctorAvailability,
  DoctorScheduleException,
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

export function getAppointmentSummary(signal?: AbortSignal): Promise<AppointmentSummary> {
  return apiRequest<AppointmentSummary>('/appointments/summary', { signal });
}

export function getAvailableSlots(
  doctorId: string,
  date: string,
  signal?: AbortSignal
): Promise<AvailableSlotsResponse> {
  const path = `/doctors/${encodeURIComponent(doctorId)}/available-slots?date=${encodeURIComponent(date)}`;
  return apiRequest<AvailableSlotsResponse>(path, { signal });
}

export const getDoctorAvailability = (doctorId: string) => apiRequest<DoctorAvailability[]>(`/doctors/${encodeURIComponent(doctorId)}/availability`);
export const addDoctorAvailability = (doctorId: string, body: Omit<DoctorAvailability, 'id' | 'doctorId'>) => apiRequest<DoctorAvailability>(`/doctors/${encodeURIComponent(doctorId)}/availability`, { method: 'POST', body });
export const deleteDoctorAvailability = (doctorId: string, itemId: string) => apiRequest<void>(`/doctors/${encodeURIComponent(doctorId)}/availability/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
export const getScheduleExceptions = (doctorId: string) => apiRequest<DoctorScheduleException[]>(`/doctors/${encodeURIComponent(doctorId)}/schedule-exceptions`);
export const addScheduleException = (doctorId: string, body: { date: string; type: 'UNAVAILABLE' | 'CUSTOM_HOURS'; startTime?: string; endTime?: string; reason?: string }) => apiRequest(`/doctors/${encodeURIComponent(doctorId)}/schedule-exceptions`, { method: 'POST', body });
export const deleteScheduleException = (doctorId: string, itemId: string) => apiRequest<void>(`/doctors/${encodeURIComponent(doctorId)}/schedule-exceptions/${encodeURIComponent(itemId)}`, { method: 'DELETE' });

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
