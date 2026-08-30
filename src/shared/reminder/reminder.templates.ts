const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export interface EmailMessage {
  subject: string;
  text: string;
  html: string;
}

export interface AppointmentEmailFacts {
  patientName?: string;
  doctorName: string;
  appointmentTime: string;
  appointmentTzOffsetMinutes: number;
}

export interface ConfirmationReminderFacts extends AppointmentEmailFacts {
  confirmationDeadlineAt: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * There is no stored IANA timezone, only the UTC offset captured at booking
 * time, so this renders wall-clock date/time by shifting the UTC instant by
 * that fixed offset rather than going through Intl + a zone name.
 */
function wallClockParts(iso: string, tzOffsetMinutes: number) {
  const shifted = new Date(new Date(iso).getTime() + tzOffsetMinutes * 60_000);
  return {
    dayName: DAY_NAMES[shifted.getUTCDay()],
    day: shifted.getUTCDate(),
    monthName: MONTH_NAMES[shifted.getUTCMonth()],
    year: shifted.getUTCFullYear(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes()
  };
}

function formatDate(iso: string, tzOffsetMinutes: number): string {
  const p = wallClockParts(iso, tzOffsetMinutes);
  return `${p.dayName}, ${p.day} ${p.monthName} ${p.year}`;
}

function formatTime(iso: string, tzOffsetMinutes: number): string {
  const p = wallClockParts(iso, tzOffsetMinutes);
  const period = p.hours >= 12 ? 'PM' : 'AM';
  const hour12 = p.hours % 12 === 0 ? 12 : p.hours % 12;
  return `${hour12}:${String(p.minutes).padStart(2, '0')} ${period}`;
}

function greeting(patientName: string | undefined): string {
  return patientName ? `Hi ${patientName},` : 'Hi,';
}

export function buildConfirmationReminderEmail(facts: ConfirmationReminderFacts): EmailMessage {
  const appointmentDate = formatDate(facts.appointmentTime, facts.appointmentTzOffsetMinutes);
  const appointmentTime = formatTime(facts.appointmentTime, facts.appointmentTzOffsetMinutes);
  const deadlineDate = formatDate(facts.confirmationDeadlineAt, facts.appointmentTzOffsetMinutes);
  const deadlineTime = formatTime(facts.confirmationDeadlineAt, facts.appointmentTzOffsetMinutes);

  const text = [
    'Appointment Reminder',
    '',
    `${greeting(facts.patientName)}`,
    '',
    `Your appointment with ${facts.doctorName} is scheduled for:`,
    `${appointmentDate}, ${appointmentTime}`,
    '',
    'Please confirm or cancel your appointment before:',
    `${deadlineDate}, ${deadlineTime}`,
    '',
    'If we do not receive a response before this deadline, your appointment will be marked ' +
      'as no response and the reserved time slot may be released.',
    '',
    'Open the healthcare appointment application to confirm or cancel your appointment.'
  ].join('\n');

  const html = [
    '<h2>Appointment Reminder</h2>',
    `<p>${escapeHtml(greeting(facts.patientName))}</p>`,
    `<p>Your appointment with <strong>${escapeHtml(facts.doctorName)}</strong> is scheduled for:</p>`,
    `<p><strong>${escapeHtml(appointmentDate)}</strong><br/><strong>${escapeHtml(appointmentTime)}</strong></p>`,
    '<p>Please confirm or cancel your appointment before:</p>',
    `<p><strong>${escapeHtml(deadlineDate)}</strong><br/><strong>${escapeHtml(deadlineTime)}</strong></p>`,
    '<p>If we do not receive a response before this deadline, your appointment will be marked ' +
      'as no response and the reserved time slot may be released.</p>',
    '<p>Open the healthcare appointment application to confirm or cancel your appointment.</p>'
  ].join('');

  return {
    subject: `Confirm your appointment with ${facts.doctorName} — respond by ${deadlineDate} ${deadlineTime}`,
    text,
    html
  };
}

export function buildUpcomingReminderEmail(facts: AppointmentEmailFacts): EmailMessage {
  const appointmentDate = formatDate(facts.appointmentTime, facts.appointmentTzOffsetMinutes);
  const appointmentTime = formatTime(facts.appointmentTime, facts.appointmentTzOffsetMinutes);

  const text = [
    `${greeting(facts.patientName)}`,
    '',
    `Your confirmed appointment with ${facts.doctorName} is in 2 hours.`,
    '',
    `${appointmentDate}, ${appointmentTime}`
  ].join('\n');

  const html = [
    `<p>${escapeHtml(greeting(facts.patientName))}</p>`,
    `<p>Your confirmed appointment with <strong>${escapeHtml(facts.doctorName)}</strong> is in 2 hours.</p>`,
    `<p><strong>${escapeHtml(appointmentDate)}</strong><br/><strong>${escapeHtml(appointmentTime)}</strong></p>`
  ].join('');

  return {
    subject: `Upcoming appointment with ${facts.doctorName} — ${appointmentDate} ${appointmentTime}`,
    text,
    html
  };
}
