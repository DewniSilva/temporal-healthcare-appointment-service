import { createHash } from 'node:crypto';
import { Resend } from 'resend';

export interface ReminderEmailInput {
  apiKey: string;
  from: string;
  to: string;
  appointmentId: string;
  appointmentTime: string;
  doctorName: string;
}

const reminderTimeFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'full',
  timeStyle: 'short',
  timeZone: 'UTC'
});

/** The backend has no per-patient timezone on file, so the reminder states the time in UTC explicitly rather than an ambiguous local time. */
function formatAppointmentTime(appointmentTime: string): string {
  return `${reminderTimeFormatter.format(new Date(appointmentTime))} UTC`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildReminderEmail(input: Pick<ReminderEmailInput, 'from' | 'to' | 'appointmentTime' | 'doctorName'>) {
  const when = formatAppointmentTime(input.appointmentTime);
  return {
    from: input.from,
    to: [input.to],
    subject: `Appointment reminder: ${when} with ${input.doctorName}`,
    text: `You have an upcoming appointment with ${input.doctorName} on ${when}. Please open the healthcare appointment application to review, confirm, or cancel it.`,
    html: [
      `<p>You have an upcoming appointment with <strong>${escapeHtml(input.doctorName)}</strong> on ${escapeHtml(when)}.</p>`,
      '<p>Please open the healthcare appointment application to review, confirm, or cancel it.</p>'
    ].join('')
  };
}

export function reminderIdempotencyKey(appointmentId: string): string {
  const digest = createHash('sha256').update(appointmentId).digest('hex');
  return `appointment-reminder/${digest}`;
}

export async function sendReminderEmail(input: ReminderEmailInput): Promise<string> {
  const resend = new Resend(input.apiKey);
  const { data, error } = await resend.emails.send(
    buildReminderEmail(input),
    { idempotencyKey: reminderIdempotencyKey(input.appointmentId) }
  );

  if (error || !data) throw new Error(error?.message ?? 'Resend returned no message ID.');
  return data.id;
}
