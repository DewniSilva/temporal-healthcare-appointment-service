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
  appointmentStatus: 'CONFIRMED',
  reservationStatus: 'RESERVED',
  confirmationReminderAt: '2026-08-31T10:00:00Z',
  confirmationDeadlineAt: '2026-09-01T04:00:00Z',
  upcomingReminderAt: '2026-09-01T08:00:00Z',
  confirmationReminderSent: true,
  upcomingReminderSent: false,
  confirmedAt: '2026-08-31T12:00:00Z'
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

  it('shows the result as soon as the workflow is queryable, without waiting for a terminal status', async () => {
    vi.spyOn(api, 'getAppointment').mockResolvedValue(appointment);
    const scheduledWorkflow: AppointmentWorkflowState = {
      appointmentStatus: 'BOOKED',
      reservationStatus: 'RESERVED',
      confirmationReminderAt: '2026-09-04T20:00:00Z',
      confirmationDeadlineAt: '2026-09-05T14:00:00Z',
      upcomingReminderAt: '2026-09-05T18:00:00Z',
      confirmationReminderSent: false,
      upcomingReminderSent: false,
      confirmedAt: null
    };
    let workflowAttempt = 0;
    vi.spyOn(api, 'getWorkflowState').mockImplementation(async () => {
      workflowAttempt += 1;
      return scheduledWorkflow;
    });

    const { result } = renderHook(() => useBookingProgress('apt-1', fastBackoff));

    // A freshly booked appointment is durably scheduled up to a week out, so
    // the initial booking screen must not keep polling until CONFIRMED; a
    // single successful workflow read is enough to show the result.
    await waitFor(() => expect(result.current.phase).toBe('complete'));
    expect(result.current.workflow).toEqual(scheduledWorkflow);
    expect(workflowAttempt).toBe(1);
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
