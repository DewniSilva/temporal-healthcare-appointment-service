import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma';
import { getEnv } from '../../shared/config/env';
import { APPOINTMENT_SLOT_MINUTES, APPOINTMENT_SLOT_MS } from '../../shared/appointmentSlots';
import { appointmentConflictsWithException, computeDaySlots } from '../../shared/scheduling/availability';
import { calendarDateDayOfWeek, nextCalendarDate, zonedWallClockToUtc } from '../../shared/scheduling/timezone';
import type { AvailabilityInput, RecurringWindow } from '../../shared/scheduling/availability.types';
import { AppError } from './errors';
import type { AuthenticatedUser } from '../auth/auth.service';
import { assertCanManageDoctorSchedule } from '../auth/authorization';
import type {
  CreateAvailabilitySchema,
  CreateClinicClosureSchema,
  CreateScheduleExceptionSchema,
  UpdateAvailabilitySchema
} from './doctorSchedule.schema';

async function assertDoctorExists(doctorId: string): Promise<void> {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, select: { id: true } });
  if (!doctor) throw new AppError(404, 'DOCTOR_NOT_FOUND', 'Doctor not found.');
}

function windowsOverlap(a: RecurringWindow, b: RecurringWindow): boolean {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

/**
 * Same query shape as worker/scheduling/scheduling.repository.ts's
 * getAvailabilityContext — deliberately not imported from there (backend
 * must not import worker code). This mirrors the existing pattern in
 * appointment.service.ts, which likewise does its own direct Prisma read for
 * the booking preflight check rather than reaching into the worker's
 * reservation repository; the shared, reused part is the pure
 * computeAvailableSlots calculation these rows feed into.
 */
async function getAvailabilityContext(doctorId: string, date: string, timeZone: string): Promise<Omit<AvailabilityInput, 'durationMinutes'>> {
  const dayOfWeek = calendarDateDayOfWeek(date);
  const dateOnly = new Date(`${date}T00:00:00Z`);
  const dayStartUtc = zonedWallClockToUtc(date, '00:00', timeZone);
  const dayEndUtc = zonedWallClockToUtc(nextCalendarDate(date), '00:00', timeZone);

  const [availabilityRows, exceptionRow, closureRow, reservationRows] = await Promise.all([
    prisma.doctorAvailability.findMany({ where: { doctorId, dayOfWeek, isActive: true }, select: { startTime: true, endTime: true } }),
    prisma.doctorScheduleException.findUnique({ where: { doctorId_date: { doctorId, date: dateOnly } }, select: { type: true, startTime: true, endTime: true } }),
    prisma.clinicClosure.findUnique({ where: { date: dateOnly }, select: { isClosed: true } }),
    prisma.slotReservation.findMany({
      where: { doctorId, status: { in: ['RESERVING', 'RESERVED'] }, appointmentTime: { gte: dayStartUtc, lt: dayEndUtc } },
      select: { appointmentTime: true }
    })
  ]);

  return {
    date,
    timeZone,
    recurringWindows: availabilityRows,
    exception: exceptionRow,
    clinicClosed: closureRow?.isClosed ?? false,
    blockingIntervals: reservationRows.map((row) => ({
      startAt: row.appointmentTime.toISOString(),
      endAt: new Date(row.appointmentTime.getTime() + APPOINTMENT_SLOT_MS).toISOString()
    }))
  };
}

export async function getAvailableSlots(doctorId: string, date: string, user: AuthenticatedUser) {
  void user; // reading available slots is open to any authenticated role (patients need it to book)
  await assertDoctorExists(doctorId);
  const timeZone = getEnv().CLINIC_TIMEZONE;
  const context = await getAvailabilityContext(doctorId, date, timeZone);
  const slots = computeDaySlots({ ...context, durationMinutes: APPOINTMENT_SLOT_MINUTES });
  return { doctorId, date, slots };
}

export async function listAvailability(doctorId: string) {
  await assertDoctorExists(doctorId);
  return prisma.doctorAvailability.findMany({ where: { doctorId }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] });
}

export async function createAvailability(doctorId: string, body: CreateAvailabilitySchema, user: AuthenticatedUser) {
  assertCanManageDoctorSchedule(user, doctorId);
  await assertDoctorExists(doctorId);
  const siblings = await prisma.doctorAvailability.findMany({
    where: { doctorId, dayOfWeek: body.dayOfWeek, isActive: true },
    select: { startTime: true, endTime: true }
  });
  if (siblings.some((sibling) => windowsOverlap(sibling, body))) {
    throw new AppError(409, 'AVAILABILITY_OVERLAP', 'This window overlaps an existing active availability window on that day.');
  }
  return prisma.doctorAvailability.create({
    data: { doctorId, dayOfWeek: body.dayOfWeek, startTime: body.startTime, endTime: body.endTime, isActive: body.isActive ?? true }
  });
}

export async function updateAvailability(doctorId: string, itemId: string, body: UpdateAvailabilitySchema, user: AuthenticatedUser) {
  assertCanManageDoctorSchedule(user, doctorId);
  const current = await prisma.doctorAvailability.findUnique({ where: { id: itemId } });
  if (!current || current.doctorId !== doctorId) throw new AppError(404, 'AVAILABILITY_NOT_FOUND', 'Availability window not found.');

  const merged: RecurringWindow & { dayOfWeek: number; isActive: boolean } = {
    dayOfWeek: body.dayOfWeek ?? current.dayOfWeek,
    startTime: body.startTime ?? current.startTime,
    endTime: body.endTime ?? current.endTime,
    isActive: body.isActive ?? current.isActive
  };
  if (merged.isActive) {
    const siblings = await prisma.doctorAvailability.findMany({
      where: { doctorId, dayOfWeek: merged.dayOfWeek, isActive: true, id: { not: itemId } },
      select: { startTime: true, endTime: true }
    });
    if (siblings.some((sibling) => windowsOverlap(sibling, merged))) {
      throw new AppError(409, 'AVAILABILITY_OVERLAP', 'This window overlaps an existing active availability window on that day.');
    }
  }
  return prisma.doctorAvailability.update({ where: { id: itemId }, data: merged });
}

export async function deleteAvailability(doctorId: string, itemId: string, user: AuthenticatedUser): Promise<void> {
  assertCanManageDoctorSchedule(user, doctorId);
  const current = await prisma.doctorAvailability.findUnique({ where: { id: itemId }, select: { doctorId: true } });
  if (!current || current.doctorId !== doctorId) throw new AppError(404, 'AVAILABILITY_NOT_FOUND', 'Availability window not found.');
  await prisma.doctorAvailability.delete({ where: { id: itemId } });
}

export async function listScheduleExceptions(doctorId: string) {
  await assertDoctorExists(doctorId);
  return prisma.doctorScheduleException.findMany({ where: { doctorId }, orderBy: { date: 'asc' } });
}

export async function createScheduleException(doctorId: string, body: CreateScheduleExceptionSchema, user: AuthenticatedUser) {
  assertCanManageDoctorSchedule(user, doctorId);
  await assertDoctorExists(doctorId);
  const timeZone = getEnv().CLINIC_TIMEZONE;
  const dateOnly = new Date(`${body.date}T00:00:00Z`);

  let exception;
  try {
    exception = await prisma.doctorScheduleException.create({
      data: {
        doctorId,
        date: dateOnly,
        type: body.type,
        startTime: body.startTime ?? null,
        endTime: body.endTime ?? null,
        reason: body.reason ?? null
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'SCHEDULE_EXCEPTION_EXISTS', 'An exception already exists for this doctor and date.');
    }
    throw error;
  }

  // Detection only — existing appointments are never modified here (spec §8/§9).
  const dayStartUtc = zonedWallClockToUtc(body.date, '00:00', timeZone);
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60_000);
  const affected = await prisma.appointment.findMany({
    where: { doctorId, status: { in: ['BOOKED', 'CONFIRMED'] }, appointmentTime: { gte: dayStartUtc, lt: dayEndUtc } },
    select: { id: true, appointmentTime: true, status: true, patientId: true }
  });
  const exceptionForConflictCheck = { type: body.type, startTime: body.startTime ?? null, endTime: body.endTime ?? null };
  const conflictingAppointments = affected.filter((appointment) =>
    appointmentConflictsWithException(appointment.appointmentTime, exceptionForConflictCheck, body.date, timeZone)
  );

  return { exception, conflictingAppointments };
}

export async function deleteScheduleException(doctorId: string, itemId: string, user: AuthenticatedUser): Promise<void> {
  assertCanManageDoctorSchedule(user, doctorId);
  const current = await prisma.doctorScheduleException.findUnique({ where: { id: itemId }, select: { doctorId: true } });
  if (!current || current.doctorId !== doctorId) throw new AppError(404, 'SCHEDULE_EXCEPTION_NOT_FOUND', 'Schedule exception not found.');
  await prisma.doctorScheduleException.delete({ where: { id: itemId } });
}

export async function listClinicClosures() {
  return prisma.clinicClosure.findMany({ orderBy: { date: 'asc' } });
}

export async function createClinicClosure(body: CreateClinicClosureSchema, user: AuthenticatedUser) {
  if (user.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Only an admin can manage clinic closures.');
  try {
    return await prisma.clinicClosure.create({
      data: { date: new Date(`${body.date}T00:00:00Z`), name: body.name, isClosed: body.isClosed ?? true }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'CLINIC_CLOSURE_EXISTS', 'A closure already exists for this date.');
    }
    throw error;
  }
}

export async function deleteClinicClosure(itemId: string, user: AuthenticatedUser): Promise<void> {
  if (user.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Only an admin can manage clinic closures.');
  const current = await prisma.clinicClosure.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!current) throw new AppError(404, 'CLINIC_CLOSURE_NOT_FOUND', 'Clinic closure not found.');
  await prisma.clinicClosure.delete({ where: { id: itemId } });
}
