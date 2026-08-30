import { describe, expect, it } from 'vitest';
import { buildConfirmationReminderEmail, buildUpcomingReminderEmail } from '../src/shared/reminder/reminder.templates';

describe('confirmation reminder email', () => {
  const facts = {
    patientName: 'Alex Rivera',
    doctorName: 'Dr. Silva',
    appointmentTime: '2026-08-31T15:00:00Z',
    appointmentTzOffsetMinutes: 0,
    confirmationDeadlineAt: '2026-08-31T09:00:00.000Z'
  };

  it('states the patient/doctor name, the appointment date/time, and the exact deadline', () => {
    const message = buildConfirmationReminderEmail(facts);
    expect(message.text).toContain('Alex Rivera');
    expect(message.text).toContain('Dr. Silva');
    expect(message.text).toContain('Monday, 31 August 2026');
    expect(message.text).toContain('3:00 PM');
    // The deadline (6h before) must be the literal date/time, not a vague phrase.
    expect(message.text).toContain('9:00 AM');
    expect(message.text.toLowerCase()).not.toContain('confirm soon');
  });

  it('explains that a missed deadline may release the slot', () => {
    const message = buildConfirmationReminderEmail(facts);
    expect(message.text.toLowerCase()).toContain('no response');
    expect(message.text.toLowerCase()).toContain('released');
  });

  it('mentions both confirm and cancel', () => {
    const message = buildConfirmationReminderEmail(facts);
    expect(message.text.toLowerCase()).toContain('confirm');
    expect(message.text.toLowerCase()).toContain('cancel');
  });

  it('renders the wall-clock time using the appointment offset, not raw UTC', () => {
    const message = buildConfirmationReminderEmail({ ...facts, appointmentTzOffsetMinutes: 330 }); // +05:30
    expect(message.text).toContain('8:30 PM');
  });

  it('escapes HTML-significant characters in the doctor name', () => {
    const message = buildConfirmationReminderEmail({ ...facts, doctorName: '<script>alert(1)</script>' });
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
  });

  it('omits patient/diagnosis-sensitive wording beyond the name itself', () => {
    const message = buildConfirmationReminderEmail(facts);
    expect(message.text).not.toMatch(/diagnosis/i);
  });
});

describe('upcoming reminder email', () => {
  it('does not ask the patient to confirm again', () => {
    const message = buildUpcomingReminderEmail({
      patientName: 'Alex Rivera',
      doctorName: 'Dr. Silva',
      appointmentTime: '2026-08-31T15:00:00Z',
      appointmentTzOffsetMinutes: 0
    });
    expect(message.text.toLowerCase()).not.toMatch(/please confirm|confirm or cancel|confirm your appointment/);
    expect(message.text).toContain('Dr. Silva');
    expect(message.text).toContain('2 hours');
  });
});
