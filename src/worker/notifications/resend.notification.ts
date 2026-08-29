import { Resend } from 'resend';
import type { EmailMessage } from '../../shared/reminder/reminder.templates';

export interface SendEmailInput {
  apiKey: string;
  from: string;
  to: string;
  idempotencyKey: string;
  message: EmailMessage;
}

export async function sendEmail(input: SendEmailInput): Promise<string> {
  const resend = new Resend(input.apiKey);
  const { data, error } = await resend.emails.send(
    { from: input.from, to: [input.to], subject: input.message.subject, text: input.message.text, html: input.message.html },
    { idempotencyKey: input.idempotencyKey }
  );

  if (error || !data) throw new Error(error?.message ?? 'Resend returned no message ID.');
  return data.id;
}
