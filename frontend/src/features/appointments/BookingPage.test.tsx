import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BookingPage } from './BookingPage';
import { TestProviders, makeAuthContextValue, makeAuthUser } from '../../test/testUtils';
import { ApiError } from '../../lib/apiError';
import * as appointmentsApi from './api';

// A fixed 10:00 AM keeps this inside the working-hours window regardless of
// what time the test happens to run at; only the date needs to move forward.
function futureDateParts(daysFromNow: number): { date: string; time: string } {
  const future = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}`,
    time: '10:00'
  };
}

function renderBookingPage() {
  return render(
    <TestProviders authValue={makeAuthContextValue({ user: makeAuthUser({ role: 'PATIENT', patientId: 'patient-001' }) })}>
      <BookingPage />
    </TestProviders>
  );
}

async function fillValidForm() {
  const { date, time } = futureDateParts(2);
  fireEvent.change(screen.getByLabelText(/doctor id/i), { target: { value: 'doctor-001' } });
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: date } });
  fireEvent.change(screen.getByLabelText(/20-minute appointment slot/i), { target: { value: time } });
}

describe('BookingPage validation', () => {
  it('rejects submission with a past date/time', async () => {
    renderBookingPage();
    fireEvent.change(screen.getByLabelText(/doctor id/i), { target: { value: 'doctor-001' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2020-01-01' } });
    fireEvent.change(screen.getByLabelText(/20-minute appointment slot/i), { target: { value: '09:00' } });
    fireEvent.click(screen.getByText('Book appointment'));

    await waitFor(() => expect(screen.getByText(/future/i)).toBeInTheDocument());
  });

  it('rejects submission with a missing doctor ID', async () => {
    renderBookingPage();
    const { date, time } = futureDateParts(1);
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: date } });
    fireEvent.change(screen.getByLabelText(/20-minute appointment slot/i), { target: { value: time } });
    fireEvent.click(screen.getByText('Book appointment'));

    await waitFor(() => expect(screen.getByText(/at least 3 characters/i)).toBeInTheDocument());
  });

  it('locks the patient ID field to the JWT-derived patientId', () => {
    renderBookingPage();
    const patientIdField = screen.getByLabelText(/patient id/i) as HTMLInputElement;
    expect(patientIdField.value).toBe('patient-001');
    expect(patientIdField).toHaveAttribute('readonly');
  });
});

describe('BookingPage idempotency key', () => {
  it('reuses the same Idempotency-Key when the user retries after a failed submission', async () => {
    vi.spyOn(appointmentsApi, 'getAppointment').mockResolvedValue({
      id: 'apt-1',
      patientId: 'patient-001',
      doctorId: 'doctor-001',
      appointmentTime: '2026-09-01T10:00:00Z',
      status: 'BOOKED',
      createdAt: '2026-08-27T00:00:00Z',
      updatedAt: '2026-08-27T00:00:00Z'
    });
    vi.spyOn(appointmentsApi, 'getWorkflowState').mockResolvedValue({
      status: 'CONFIRMED',
      reminderSent: true,
      confirmed: true,
      cancelled: false,
      reminderAt: '2026-09-01T08:00:00Z'
    });

    const createSpy = vi
      .spyOn(appointmentsApi, 'createAppointment')
      .mockRejectedValueOnce(new ApiError(503, 'TEMPORAL_UNAVAILABLE', 'The booking service is temporarily unavailable.'))
      .mockResolvedValueOnce({ appointmentId: 'apt-1', workflowId: 'appointment-apt-1', status: 'STARTED' });

    renderBookingPage();
    await fillValidForm();

    fireEvent.click(screen.getByText('Book appointment'));
    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    await screen.findByText(/temporarily unavailable/i);

    fireEvent.click(screen.getByText('Book appointment'));
    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(2));

    const firstIdempotencyKey = createSpy.mock.calls[0][1];
    const secondIdempotencyKey = createSpy.mock.calls[1][1];
    expect(secondIdempotencyKey).toBe(firstIdempotencyKey);

    await screen.findByText(/processing your booking request/i);
  });

  it('generates a new key only when the user explicitly books another appointment', async () => {
    vi.spyOn(appointmentsApi, 'getAppointment').mockResolvedValue({
      id: 'apt-2',
      patientId: 'patient-001',
      doctorId: 'doctor-001',
      appointmentTime: '2026-09-01T10:00:00Z',
      status: 'BOOKED',
      createdAt: '2026-08-27T00:00:00Z',
      updatedAt: '2026-08-27T00:00:00Z'
    });
    vi.spyOn(appointmentsApi, 'getWorkflowState').mockResolvedValue({
      status: 'CONFIRMED',
      reminderSent: true,
      confirmed: true,
      cancelled: false,
      reminderAt: '2026-09-01T08:00:00Z'
    });
    const createSpy = vi
      .spyOn(appointmentsApi, 'createAppointment')
      .mockResolvedValue({ appointmentId: 'apt-2', workflowId: 'appointment-apt-2', status: 'STARTED' });

    renderBookingPage();
    await fillValidForm();
    fireEvent.click(screen.getByText('Book appointment'));
    await screen.findByText(/processing your booking request/i);

    fireEvent.click(screen.getByText('Book another appointment'));
    await fillValidForm();
    fireEvent.click(screen.getByText('Book appointment'));
    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(2));

    const firstKey = createSpy.mock.calls[0][1];
    const secondKey = createSpy.mock.calls[1][1];
    expect(secondKey).not.toBe(firstKey);
  });
});
