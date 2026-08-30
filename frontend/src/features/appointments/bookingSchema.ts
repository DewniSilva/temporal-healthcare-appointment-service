import { z } from 'zod';

// Mirrors the `id` pattern in src/backend/api/appointment.schema.ts.
const idPattern = /^[A-Za-z0-9_-]+$/;
const idField = z
  .string()
  .min(3, 'Must be at least 3 characters')
  .max(80, 'Must be 80 characters or fewer')
  .regex(idPattern, 'Use only letters, numbers, hyphens, or underscores');

// `time` holds the exact `startAt` ISO instant of a slot returned by
// GET /doctors/:doctorId/available-slots — the <select> only ever offers
// values that came from that response, so format/working-hours/alignment
// are already guaranteed by construction; only "did the user pick one, and
// is it still in the future" need checking here.
export const bookingFormSchema = z
  .object({
    patientId: idField,
    doctorId: idField,
    date: z.string().min(1, 'Date is required'),
    time: z.string().min(1, 'Choose an available time slot')
  })
  .refine(
    (values) => new Date(values.time).getTime() > Date.now(),
    { message: 'This slot is no longer in the future — choose another', path: ['time'] }
  );

export type BookingFormValues = z.infer<typeof bookingFormSchema>;
