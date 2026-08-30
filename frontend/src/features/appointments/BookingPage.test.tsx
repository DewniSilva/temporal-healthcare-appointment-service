import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BookingPage } from './BookingPage';
import { TestProviders, makeAuthContextValue, makeAuthUser } from '../../test/testUtils';
import { ApiError } from '../../lib/apiError';
import * as appointmentsApi from './api';

// A fixed 10:00 AM UTC slot keeps this deterministic regardless of what time
// the test happens to run at; only the date needs to move forward. Mocks
// GET /doctors/:id/available-slots so the form's <select> has this exact
// option to choose, mirroring what the real per-doctor schedule API returns.
function futureSlot(daysFromNow: number): { date: string; startAt: string; endAt: string } {
  const future = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}`;
  return { date, startAt: `${date}T10:00:00.000Z`, endAt: `${date}T10:20:00.000Z` };
}

function renderBookingPage() {
  return render(
    <TestProviders authValue={makeAuthContextValue({ user: makeAuthUser({ role: 'PATIENT', patientId: 'patient-001' }) })}>
      <BookingPage />
    </TestProviders>
  );
}

async function fillValidForm() {
  const { date, startAt, endAt } = futureSlot(2);
  vi.spyOn(appointmentsApi, 'getAvailableSlots').mockResolvedValue({
    doctorId: 'doctor-001',
    date,
    slots: [{ startAt, endAt, status: 'AVAILABLE' }]
  });

  fireEvent.change(screen.getByLabelText(/doctor id/i), { target: { value: 'doctor-001' } });
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: date } });
  await screen.findByRole('option', { name: /–/ });
  fireEvent.change(screen.getByLabelText(/time slot/i), { target: { value: startAt } });
}

describe('BookingPage validation', () => {
  it('rejects submission with a past date/time', async () => {
    vi.spyOn(appointmentsApi, 'getAvailableSlots').mockResolvedValue({
      doctorId: 'doctor-001',
      date: '2020-01-01',
      slots: [{ startAt: '2020-01-01T09:00:00.000Z', endAt: '2020-01-01T09:20:00.000Z', status: 'PAST' }]
    });

    renderBookingPage();
    fireEvent.change(screen.getByLabelText(/doctor id/i), { target: { value: 'doctor-001' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2020-01-01' } });
    await screen.findByRole('option', { name: /–/ });
    // The slot is rendered disabled (status PAST), so the raw value must be
    // forced through change events directly rather than a real user pick —
    // this exercises the schema's own "still in the future" refine as a
    // defense-in-depth check, independent of the disabled-option UI guard.
    fireEvent.change(screen.getByLabelText(/time slot/i), { target: { value: '2020-01-01T09:00:00.000Z' } });
    fireEvent.click(screen.getByText('Book appointment'));

    await waitFor(() => expect(screen.getByText(/future/i)).toBeInTheDocument());
  });

  it('rejects submission with a missing doctor ID', async () => {
    renderBookingPage();
    const { date } = futureSlot(1);
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: date } });
    fireEvent.click(screen.getByText('Book appointment'));

    await waitFor(() => expect(screen.getByText(/at least 3 characters/i)).toBeInTheDocument());
  });

  it('locks the patient ID field to the JWT-derived patientId', () => {
    renderBookingPage();
    const patientIdField = screen.getByLabelText(/patient id/i) as HTMLInputElement;
    expect(patientIdField.value).toBe('patient-001');
    expect(patientIdField).toHaveAttribute('readonly');
  });

  it('disables the time slot picker until a doctor and date are chosen, then offers the fetched slots', async () => {
    renderBookingPage();
    const timeSelect = screen.getByLabelText(/time slot/i) as HTMLSelectElement;
    expect(timeSelect).toBeDisabled();

    await fillValidForm();
    expect(timeSelect).not.toBeDisabled();
    expect((timeSelect.querySelector('option[value]:not([value=""])') as HTMLOptionElement).textContent).toMatch(/–/);
  });

  it('shows the full day, including already-booked and past slots, but only the open ones are selectable', async () => {
    const { date } = futureSlot(2);
    vi.spyOn(appointmentsApi, 'getAvailableSlots').mockResolvedValue({
      doctorId: 'doctor-001',
      date,
      slots: [
        { startAt: `${date}T02:00:00.000Z`, endAt: `${date}T02:20:00.000Z`, status: 'PAST' },
        { startAt: `${date}T03:00:00.000Z`, endAt: `${date}T03:20:00.000Z`, status: 'RESERVED' },
        { startAt: `${date}T04:00:00.000Z`, endAt: `${date}T04:20:00.000Z`, status: 'AVAILABLE' }
      ]
    });

    renderBookingPage();
    fireEvent.change(screen.getByLabelText(/doctor id/i), { target: { value: 'doctor-001' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: date } });
    await screen.findAllByRole('option', { name: /–/ });

    const timeSelect = screen.getByLabelText(/time slot/i) as HTMLSelectElement;
    const options = Array.from(timeSelect.querySelectorAll('option[value]:not([value=""])')) as HTMLOptionElement[];
    expect(options).toHaveLength(3);

    const pastOption = options.find((o) => o.textContent?.includes('passed'))!;
    const reservedOption = options.find((o) => o.textContent?.includes('booked'))!;
    const openOption = options.find((o) => !o.disabled)!;

    expect(pastOption.disabled).toBe(true);
    expect(reservedOption.disabled).toBe(true);
    expect(openOption.textContent).not.toMatch(/passed|booked/);
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
      appointmentStatus: 'CONFIRMED',
      reservationStatus: 'RESERVED',
      confirmationReminderAt: '2026-08-31T10:00:00Z',
      confirmationDeadlineAt: '2026-09-01T04:00:00Z',
      upcomingReminderAt: '2026-09-01T08:00:00Z',
      confirmationReminderSent: true,
      upcomingReminderSent: false,
      confirmedAt: '2026-08-31T12:00:00Z'
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
      appointmentStatus: 'CONFIRMED',
      reservationStatus: 'RESERVED',
      confirmationReminderAt: '2026-08-31T10:00:00Z',
      confirmationDeadlineAt: '2026-09-01T04:00:00Z',
      upcomingReminderAt: '2026-09-01T08:00:00Z',
      confirmationReminderSent: true,
      upcomingReminderSent: false,
      confirmedAt: '2026-08-31T12:00:00Z'
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
