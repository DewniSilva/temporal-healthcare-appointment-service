import { z } from 'zod';
import { isAlignedAppointmentSlot, isWithinWorkingHours } from '../../shared/appointmentSlots';

const id = z.string().min(3).max(80).regex(/^[A-Za-z0-9_-]+$/, 'ID contains unsupported characters');

export const appointmentParamsSchema = z.object({ id }).strict();
export const createAppointmentSchema = z.object({
  patientId: id,
  doctorId: id,
  appointmentTime: z.iso.datetime({ offset: true })
    .refine((value) => new Date(value).getTime() > Date.now(), 'Appointment time must be in the future')
    .refine(isAlignedAppointmentSlot, 'Appointment time must start on a 20-minute boundary (:00, :20, or :40)')
    .refine(isWithinWorkingHours, 'Appointment time must be within working hours (7:00 AM–12:00 PM or 1:00 PM–5:00 PM)')
}).strict();
export const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(8).max(128) }).strict();

export const idempotencyKeySchema = z.string().min(8).max(100).regex(/^[A-Za-z0-9_.:-]+$/);
