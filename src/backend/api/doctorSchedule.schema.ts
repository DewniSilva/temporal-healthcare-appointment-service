import { z } from 'zod';
import { id } from './appointment.schema';

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm (24-hour)');

function timeRange(a: string, b: string): boolean {
  return a < b; // "HH:mm" strings compare correctly lexicographically.
}

export const doctorIdParamsSchema = z.object({ doctorId: id }).strict();
export const doctorScheduleItemParamsSchema = z.object({ doctorId: id, itemId: id }).strict();

export const availableSlotsQuerySchema = z.object({ date: calendarDate }).strict();

export const createAvailabilitySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: clockTime,
  endTime: clockTime,
  isActive: z.boolean().optional()
}).strict().refine((body) => timeRange(body.startTime, body.endTime), {
  message: 'startTime must be before endTime',
  path: ['endTime']
});

export const updateAvailabilitySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startTime: clockTime.optional(),
  endTime: clockTime.optional(),
  isActive: z.boolean().optional()
}).strict().refine((body) => body.startTime === undefined || body.endTime === undefined || timeRange(body.startTime, body.endTime), {
  message: 'startTime must be before endTime',
  path: ['endTime']
});

export const createScheduleExceptionSchema = z.object({
  date: calendarDate,
  type: z.enum(['UNAVAILABLE', 'CUSTOM_HOURS']),
  startTime: clockTime.optional(),
  endTime: clockTime.optional(),
  reason: z.string().min(1).max(200).optional()
}).strict().superRefine((body, ctx) => {
  if (body.type === 'CUSTOM_HOURS' && (!body.startTime || !body.endTime)) {
    ctx.addIssue({ code: 'custom', message: 'CUSTOM_HOURS requires both startTime and endTime', path: ['startTime'] });
  }
  if (Boolean(body.startTime) !== Boolean(body.endTime)) {
    ctx.addIssue({ code: 'custom', message: 'startTime and endTime must be provided together', path: ['endTime'] });
  }
  if (body.startTime && body.endTime && !timeRange(body.startTime, body.endTime)) {
    ctx.addIssue({ code: 'custom', message: 'startTime must be before endTime', path: ['endTime'] });
  }
});

export const createClinicClosureSchema = z.object({
  date: calendarDate,
  name: z.string().min(1).max(200),
  isClosed: z.boolean().optional()
}).strict();

export const clinicClosureParamsSchema = z.object({ itemId: id }).strict();

export type CreateAvailabilitySchema = z.infer<typeof createAvailabilitySchema>;
export type UpdateAvailabilitySchema = z.infer<typeof updateAvailabilitySchema>;
export type CreateScheduleExceptionSchema = z.infer<typeof createScheduleExceptionSchema>;
export type CreateClinicClosureSchema = z.infer<typeof createClinicClosureSchema>;
