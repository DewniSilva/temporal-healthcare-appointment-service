import { z } from 'zod';
import { toIsoWithOffset } from '../../lib/dateTime';

// Mirrors the `id` pattern in src/backend/api/appointment.schema.ts.
const idPattern = /^[A-Za-z0-9_-]+$/;
const idField = z
  .string()
  .min(3, 'Must be at least 3 characters')
  .max(80, 'Must be 80 characters or fewer')
  .regex(idPattern, 'Use only letters, numbers, hyphens, or underscores');

export const bookingFormSchema = z
  .object({
    patientId: idField,
    doctorId: idField,
    date: z.string().min(1, 'Date is required'),
    time: z.string().min(1, 'Time is required')
  })
  .refine(
    (values) => {
      const iso = toIsoWithOffset(values.date, values.time);
      return new Date(iso).getTime() > Date.now();
    },
    { message: 'Choose a date and time in the future', path: ['time'] }
  );

export type BookingFormValues = z.infer<typeof bookingFormSchema>;
