import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppointmentActions } from './AppointmentActions';
import { TestProviders, makeAuthContextValue, makeAuthUser } from '../../../test/testUtils';
import * as api from '../api';
import type { Appointment, AppointmentWorkflowState } from '../../../types/api';

const bookedAppointment: Appointment = {
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

const confirmedAppointment: Appointment = { ...bookedAppointment, status: 'CONFIRMED' };

function renderActions(
  role: 'PATIENT' | 'DOCTOR' | 'ADMIN',
  patientId?: string,
  appointment: Appointment = bookedAppointment,
  doctorId?: string
) {
  return render(
    <TestProviders authValue={makeAuthContextValue({ user: makeAuthUser({ role, patientId, doctorId }) })}>
      <AppointmentActions appointment={appointment} />
    </TestProviders>
  );
}

// The confirm/cancel dialog's own buttons stay in the DOM even while closed,
// and its confirm label ("Yes, cancel appointment") contains the trigger
// button's full text, so tests must target the trigger by exact role name
// rather than a substring match.
function cancelTriggerButton() {
  return screen.getByRole('button', { name: 'Cancel appointment' });
}

describe('AppointmentActions', () => {
  it('renders nothing for a doctor while the appointment is only BOOKED', () => {
    renderActions('DOCTOR', undefined, bookedAppointment, 'doctor-001');
    expect(screen.queryByText(/confirm appointment/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cancel appointment/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mark completed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mark no-show/i)).not.toBeInTheDocument();
  });

  it('gives the assigned doctor complete/no-show actions once the appointment is CONFIRMED, but not an unrelated doctor', () => {
    renderActions('DOCTOR', undefined, confirmedAppointment, 'doctor-001');
    expect(screen.getByText(/mark completed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark no-show' })).toBeInTheDocument();
    expect(screen.queryByText(/confirm appointment/i)).not.toBeInTheDocument();
    cleanup();

    renderActions('DOCTOR', undefined, confirmedAppointment, 'doctor-999');
    expect(screen.queryByText(/mark completed/i)).not.toBeInTheDocument();
  });

  it('renders nothing for a patient who does not own the appointment', () => {
    renderActions('PATIENT', 'patient-999');
    expect(screen.queryByText(/confirm appointment/i)).not.toBeInTheDocument();
  });

  it('shows both actions for the owning patient and for an admin', () => {
    renderActions('PATIENT', 'patient-001');
    expect(screen.getByText(/confirm appointment/i)).toBeInTheDocument();
    expect(cancelTriggerButton()).toBeInTheDocument();
    cleanup();

    renderActions('ADMIN');
    expect(screen.getByText(/confirm appointment/i)).toBeInTheDocument();
  });

  it('sends a confirm signal, shows "Request accepted", and disables actions while processing', async () => {
    const confirmSpy = vi.spyOn(api, 'confirmAppointment').mockResolvedValue({
      appointmentId: 'apt-1',
      status: 'CONFIRM_SIGNAL_ACCEPTED'
    });
    // A small delay gives the test a real window to observe the "accepted,
    // still processing" state before the workflow poll resolves it away.
    vi.spyOn(api, 'getWorkflowState').mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(confirmedWorkflow), 300))
    );

    renderActions('PATIENT', 'patient-001');

    fireEvent.click(screen.getByText(/confirm appointment/i));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledOnce());
    // The toast and the inline banner both use the title "Request accepted",
    // so assert on the banner's unique body text instead of that shared title.
    const busyText = /waiting for the workflow to report the updated status/i;
    await waitFor(() => {
      expect(screen.getByText(busyText)).toBeInTheDocument();
      expect(screen.getByText(/confirm appointment/i).closest('button')).toBeDisabled();
    });

    await waitFor(() => expect(screen.queryByText(busyText)).not.toBeInTheDocument());
  });

  it('asks for confirmation before cancelling and only signals after the dialog is confirmed', async () => {
    const cancelSpy = vi.spyOn(api, 'cancelAppointment').mockResolvedValue({
      appointmentId: 'apt-1',
      status: 'CANCEL_SIGNAL_ACCEPTED'
    });
    vi.spyOn(api, 'getWorkflowState').mockResolvedValue({
      appointmentStatus: 'CANCELLED',
      reservationStatus: 'RELEASED',
      confirmationReminderAt: '2026-08-31T10:00:00Z',
      confirmationDeadlineAt: '2026-09-01T04:00:00Z',
      upcomingReminderAt: '2026-09-01T08:00:00Z',
      confirmationReminderSent: true,
      upcomingReminderSent: false,
      confirmedAt: null
    });

    renderActions('PATIENT', 'patient-001');

    fireEvent.click(cancelTriggerButton());
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(cancelSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Keep appointment'));
    expect(cancelSpy).not.toHaveBeenCalled();

    fireEvent.click(cancelTriggerButton());
    fireEvent.click(screen.getByText('Yes, cancel appointment'));

    await waitFor(() => expect(cancelSpy).toHaveBeenCalledOnce());
  });
});
