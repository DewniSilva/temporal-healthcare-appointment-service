import { describe, expect, it } from 'vitest';
import { buildReminderEmail, reminderIdempotencyKey } from '../src/worker/notifications/resend.notification';

describe('Resend reminder notification', () => {
  it('includes the appointment time and doctor name, without patient or diagnosis details', () => {
    const message = buildReminderEmail({
      from: 'Healthcare Appointments <onboarding@resend.dev>',
      to: 'recipient@example.com',
      appointmentTime: '2026-09-05T20:00:00Z',
      doctorName: 'Dr. Ada Lovelace'
    });

    expect(message.to).toEqual(['recipient@example.com']);
    expect(message.text).toContain('Dr. Ada Lovelace');
    expect(message.text).toContain('September');
    expect(message.text).toContain('open the healthcare appointment application');
    expect(message.html).toContain('Dr. Ada Lovelace');
    expect(message.text).not.toMatch(/patient|diagnosis/i);
  });

  it('escapes HTML-significant characters in the doctor name', () => {
    const message = buildReminderEmail({
      from: 'Healthcare Appointments <onboarding@resend.dev>',
      to: 'recipient@example.com',
      appointmentTime: '2026-09-05T20:00:00Z',
      doctorName: '<script>alert(1)</script>'
    });

    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
  });

  it('derives a stable provider key without exposing the appointment ID', () => {
    const appointmentId = 'apt-sensitive-identifier';
    const first = reminderIdempotencyKey(appointmentId);

    expect(reminderIdempotencyKey(appointmentId)).toBe(first);
    expect(reminderIdempotencyKey('apt-other')).not.toBe(first);
    expect(first).not.toContain(appointmentId);
    expect(first.length).toBeLessThanOrEqual(256);
  });
});
