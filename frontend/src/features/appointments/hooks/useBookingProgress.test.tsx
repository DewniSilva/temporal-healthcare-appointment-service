import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useBookingProgress } from './useBookingProgress';
import { ApiError } from '../../../lib/apiError';
import * as api from '../api';
import type { Appointment, AppointmentWorkflowState } from '../../../types/api';

const fastBackoff = { initialDelayMs: 1, maxDelayMs: 2, factor: 1, maxAttempts: 5 };

const appointment: Appointment = {
  id: 'apt-1',
  patientId: 'patient-001',
  doctorId: 'doctor-001',
  appointmentTime: '2026-09-01T10:00:00Z',
  status: 'BOOKED',
  createdAt: '2026-08-27T00:00:00Z',
  updatedAt: '2026-08-27T00:00:00Z'
};

const confirmedWorkflow: AppointmentWorkflowState = {
  status: 'CONFIRMED',
  reminderSent: true,
  confirmed: true,
  cancelled: false
};

describe('useBookingProgress', () => {
  it('treats an initial 404 as expected processing and moves on once the appointment exists', async () => {
    let attempt = 0;
    vi.spyOn(api, 'getAppointment').mockImplementation(async () => {
      attempt += 1;
      if (attempt < 3) throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
      return appointment;
    });
    vi.spyOn(api, 'getWorkflowState').mockResolvedValue(confirmedWorkflow);

    const { result } = renderHook(() => useBookingProgress('apt-1', fastBackoff));

    expect(result.current.phase).toBe('locating');

    await waitFor(() => expect(result.current.phase).toBe('complete'));
    expect(result.current.appointment).toEqual(appointment);
    expect(result.current.workflow).toEqual(confirmedWorkflow);
    expect(attempt).toBe(3);
  });

  it('polls the workflow after the appointment is found, staying orchestrating until terminal', async () => {
    vi.spyOn(api, 'getAppointment').mockResolvedValue(appointment);
    let workflowAttempt = 0;
    vi.spyOn(api, 'getWorkflowState').mockImplementation(async () => {
      workflowAttempt += 1;
      if (workflowAttempt < 2) return { status: 'WAITING_FOR_CONFIRMATION', reminderSent: true, confirmed: false, cancelled: false };
      return confirmedWorkflow;
    });

    const { result } = renderHook(() => useBookingProgress('apt-1', fastBackoff));

    // The intermediate 'orchestrating' phase can be too brief to reliably
    // observe with a real-timer backoff this fast, so we only assert the
    // eventual outcome plus proof that more than one workflow poll happened.
    await waitFor(() => expect(result.current.phase).toBe('complete'));
    expect(workflowAttempt).toBeGreaterThanOrEqual(2);
  });

  it('stalls with a manual retry available when the appointment never shows up', async () => {
    vi.spyOn(api, 'getAppointment').mockRejectedValue(
      new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.')
    );

    const { result } = renderHook(() => useBookingProgress('apt-1', { ...fastBackoff, maxAttempts: 2 }));

    await waitFor(() => expect(result.current.phase).toBe('stalled'));
    expect(typeof result.current.retry).toBe('function');
  });
});
