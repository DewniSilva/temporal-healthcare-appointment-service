import {
  ActorRole,
  type AppointmentStatus,
  PrismaClient,
  type ReminderStatus,
  type ReminderType,
  type ReservationStatus,
  UserRole
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Deliberately duplicated from src/shared/scheduling/timezone.ts rather than
// imported: the Docker runtime image copies `prisma/` (this script runs from
// there via `npx prisma db seed`) but never copies `src/`, only the compiled
// `dist/`, so a relative import into `src/` would resolve locally but break
// inside the actual container. Keeping this script self-contained avoids that.
function timeZoneOffsetMinutesAt(epochMs: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(epochMs)).map((part) => [part.type, part.value]));
  const asUtcMs = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  return (asUtcMs - epochMs) / 60_000;
}

function zonedWallClockToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstOffsetMinutes = timeZoneOffsetMinutesAt(naiveUtcMs, timeZone);
  const correctedMs = naiveUtcMs - firstOffsetMinutes * 60_000;
  const secondOffsetMinutes = timeZoneOffsetMinutesAt(correctedMs, timeZone);
  return new Date(naiveUtcMs - secondOffsetMinutes * 60_000);
}

// Asia/Colombo has no DST, so this fixed offset always matches CLINIC_TIMEZONE
// (see src/shared/config/env.ts) — a real booking captures whatever offset
// the request arrived with instead of a constant, but for demo data these
// coincide.
const CLINIC_TZ = 'Asia/Colombo';
const CLINIC_TZ_OFFSET_MINUTES = 330;

// ── Date helpers — all "n days from/ago today", then aligned to a doctor's
// actual working weekdays so the seeded appointments make sense next to the
// schedules below (an appointment sitting on a day the doctor doesn't work
// would look like a bug, not a demo). ──────────────────────────────────────
function daysFromToday(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function alignToWeekday(base: Date, allowedDows: number[], direction: 'forward' | 'backward'): Date {
  const d = new Date(base);
  for (let i = 0; i < 7; i += 1) {
    if (allowedDows.includes(d.getUTCDay())) return d;
    d.setUTCDate(d.getUTCDate() + (direction === 'forward' ? 1 : -1));
  }
  return base; // unreachable for a non-empty allowedDows
}

function dateOnlyString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Reuses the app's own clinic-local -> UTC conversion, so seed data is computed exactly like a real booking would be. */
function clinicTime(date: Date, hhmm: string): Date {
  return zonedWallClockToUtc(dateOnlyString(date), hhmm, CLINIC_TZ);
}

function reminderIdempotencyKey(appointmentId: string, type: ReminderType): string {
  const suffix = type === 'CONFIRMATION_REMINDER' ? 'confirmation-reminder' : 'upcoming-reminder';
  return `appointment-${appointmentId}-${suffix}`;
}

// ── Users, patients, doctors ───────────────────────────────────────────────
async function seedIdentities(passwordHash: string) {
  const users = [
    { id: 'user-patient-001', email: 'patient1@example.test', role: UserRole.PATIENT },
    { id: 'user-patient-002', email: 'patient2@example.test', role: UserRole.PATIENT },
    { id: 'user-patient-003', email: 'patient3@example.test', role: UserRole.PATIENT },
    { id: 'user-doctor-001', email: 'doctor1@example.test', role: UserRole.DOCTOR },
    { id: 'user-doctor-002', email: 'doctor2@example.test', role: UserRole.DOCTOR },
    { id: 'user-doctor-003', email: 'doctor3@example.test', role: UserRole.DOCTOR },
    { id: 'user-admin-001', email: 'admin@example.test', role: UserRole.ADMIN }
  ];
  for (const user of users) {
    await prisma.user.upsert({ where: { id: user.id }, update: {}, create: { ...user, passwordHash } });
  }

  const patients = [
    { id: 'patient-001', displayName: 'Demo Patient One', userId: 'user-patient-001' },
    { id: 'patient-002', displayName: 'Demo Patient Two', userId: 'user-patient-002' },
    { id: 'patient-003', displayName: 'Demo Patient Three', userId: 'user-patient-003' }
  ];
  for (const patient of patients) {
    await prisma.patient.upsert({ where: { id: patient.id }, update: {}, create: patient });
  }

  const doctors = [
    { id: 'doctor-001', displayName: 'Demo Doctor', userId: 'user-doctor-001' },
    { id: 'doctor-002', displayName: 'Dr. Priya Fernando (Cardiology)', userId: 'user-doctor-002' },
    { id: 'doctor-003', displayName: 'Dr. Kasun Perera (Pediatrics)', userId: 'user-doctor-003' }
  ];
  for (const doctor of doctors) {
    await prisma.doctor.upsert({ where: { id: doctor.id }, update: {}, create: doctor });
  }
}

// ── Doctor scheduling: three doctors, three different recurring shapes ─────
// doctor-001: Mon-Fri, two windows/day (the project's original global default).
// doctor-002: Mon/Wed split hours, a short Friday, and a Saturday morning.
// doctor-003: Tue-Thu only — Mon/Fri/weekend naturally have zero availability,
// no exception needed to demonstrate that.
const DOCTOR_001_DOWS = [1, 2, 3, 4, 5];
const DOCTOR_002_DOWS = [1, 3, 5, 6];
const DOCTOR_003_DOWS = [2, 3, 4];

async function seedRecurringAvailability() {
  const existing001 = await prisma.doctorAvailability.count({ where: { doctorId: 'doctor-001' } });
  if (existing001 === 0) {
    await prisma.doctorAvailability.createMany({
      data: DOCTOR_001_DOWS.flatMap((dayOfWeek) => [
        { doctorId: 'doctor-001', dayOfWeek, startTime: '07:00', endTime: '12:00' },
        { doctorId: 'doctor-001', dayOfWeek, startTime: '13:00', endTime: '17:00' }
      ])
    });
  }

  const existing002 = await prisma.doctorAvailability.count({ where: { doctorId: 'doctor-002' } });
  if (existing002 === 0) {
    await prisma.doctorAvailability.createMany({
      data: [
        { doctorId: 'doctor-002', dayOfWeek: 1, startTime: '08:00', endTime: '13:00' },
        { doctorId: 'doctor-002', dayOfWeek: 1, startTime: '14:00', endTime: '18:00' },
        { doctorId: 'doctor-002', dayOfWeek: 3, startTime: '08:00', endTime: '13:00' },
        { doctorId: 'doctor-002', dayOfWeek: 3, startTime: '14:00', endTime: '18:00' },
        { doctorId: 'doctor-002', dayOfWeek: 5, startTime: '08:00', endTime: '12:00' },
        { doctorId: 'doctor-002', dayOfWeek: 6, startTime: '09:00', endTime: '12:00' }
      ]
    });
  }

  const existing003 = await prisma.doctorAvailability.count({ where: { doctorId: 'doctor-003' } });
  if (existing003 === 0) {
    await prisma.doctorAvailability.createMany({
      data: DOCTOR_003_DOWS.flatMap((dayOfWeek) => [
        { doctorId: 'doctor-003', dayOfWeek, startTime: '09:00', endTime: '13:00' },
        { doctorId: 'doctor-003', dayOfWeek, startTime: '14:00', endTime: '17:00' }
      ])
    });
  }
}

// ── Schedule exceptions: one of each kind the spec calls for ───────────────
async function seedScheduleExceptions() {
  const customHoursDate = alignToWeekday(daysFromToday(10), DOCTOR_002_DOWS, 'forward');
  await prisma.doctorScheduleException.upsert({
    where: { doctorId_date: { doctorId: 'doctor-002', date: customHoursDate } },
    update: {},
    create: {
      doctorId: 'doctor-002',
      date: customHoursDate,
      type: 'CUSTOM_HOURS',
      startTime: '10:00',
      endTime: '12:00',
      reason: 'Conference — reduced hours'
    }
  });

  const wholeDayLeaveDate = alignToWeekday(daysFromToday(6), DOCTOR_003_DOWS, 'forward');
  await prisma.doctorScheduleException.upsert({
    where: { doctorId_date: { doctorId: 'doctor-003', date: wholeDayLeaveDate } },
    update: {},
    create: {
      doctorId: 'doctor-003',
      date: wholeDayLeaveDate,
      type: 'UNAVAILABLE',
      startTime: null,
      endTime: null,
      reason: 'Annual leave'
    }
  });

  const partialDayLeaveDate = alignToWeekday(daysFromToday(13), DOCTOR_003_DOWS, 'forward');
  await prisma.doctorScheduleException.upsert({
    where: { doctorId_date: { doctorId: 'doctor-003', date: partialDayLeaveDate } },
    update: {},
    create: {
      doctorId: 'doctor-003',
      date: partialDayLeaveDate,
      type: 'UNAVAILABLE',
      startTime: '09:00',
      endTime: '13:00',
      reason: 'Morning hospital rounds — afternoon clinic unaffected'
    }
  });
}

// ── Clinic-wide holiday, beats every doctor's schedule that day ────────────
async function seedClinicClosures() {
  const closureDate = daysFromToday(20);
  await prisma.clinicClosure.upsert({
    where: { date: closureDate },
    update: {},
    create: { date: closureDate, name: "Founders' Day", isClosed: true }
  });
}

// ── Demo appointment history: one per meaningful terminal/non-terminal
// status, each with a consistent reservation/reminder/audit trail. These are
// static rows for exercising dashboards, badges, and lookup — NOT backed by
// a live Temporal workflow, so confirm/cancel/complete/no-show signals won't
// work against them (see the printed summary at the end of this script for
// how to create a real, live-workflow-backed appointment instead).
interface DemoAppointment {
  id: string;
  patientId: string;
  doctorId: string;
  appointmentTime: Date;
  status: AppointmentStatus;
  confirmed: boolean;
  reservationStatus: ReservationStatus | null;
  reminders: Array<{ type: ReminderType; status: ReminderStatus }>;
  transitions: string[]; // e.g. ['REQUESTED', 'RESERVING', 'BOOKED', 'CONFIRMED', 'COMPLETED']
}

async function seedDemoAppointment(demo: DemoAppointment): Promise<void> {
  const alreadySeeded = await prisma.appointment.findUnique({ where: { id: demo.id }, select: { id: true } });
  if (alreadySeeded) return;

  await prisma.appointment.create({
    data: {
      id: demo.id,
      patientId: demo.patientId,
      doctorId: demo.doctorId,
      appointmentTime: demo.appointmentTime,
      appointmentTzOffsetMinutes: CLINIC_TZ_OFFSET_MINUTES,
      status: demo.status,
      confirmedAt: demo.confirmed ? demo.appointmentTime : null
    }
  });

  if (demo.reservationStatus) {
    await prisma.slotReservation.create({
      data: {
        appointmentId: demo.id,
        doctorId: demo.doctorId,
        appointmentTime: demo.appointmentTime,
        status: demo.reservationStatus
      }
    });
  }

  for (const reminder of demo.reminders) {
    const sent = reminder.status === 'SENT' || reminder.status === 'DELIVERED';
    await prisma.reminder.create({
      data: {
        appointmentId: demo.id,
        type: reminder.type,
        status: reminder.status,
        idempotencyKey: reminderIdempotencyKey(demo.id, reminder.type),
        scheduledAt: demo.appointmentTime,
        sentAt: sent ? demo.appointmentTime : null
      }
    });
  }

  const auditRows = demo.transitions.slice(1).map((newState, index) => ({
    appointmentId: demo.id,
    actorId: null,
    actorRole: ActorRole.SYSTEM,
    action: 'APPOINTMENT_TRANSITION',
    previousState: demo.transitions[index],
    newState
  }));
  if (auditRows.length > 0) await prisma.auditLog.createMany({ data: auditRows });
}

async function seedDemoAppointmentHistory() {
  await seedDemoAppointment({
    id: 'apt-demo-booked-001',
    patientId: 'patient-001',
    doctorId: 'doctor-001',
    appointmentTime: clinicTime(alignToWeekday(daysFromToday(2), DOCTOR_001_DOWS, 'forward'), '09:00'),
    status: 'BOOKED',
    confirmed: false,
    reservationStatus: 'RESERVED',
    reminders: [
      { type: 'CONFIRMATION_REMINDER', status: 'SCHEDULED' },
      { type: 'UPCOMING_REMINDER', status: 'SCHEDULED' }
    ],
    transitions: ['REQUESTED', 'RESERVING', 'BOOKED']
  });

  await seedDemoAppointment({
    id: 'apt-demo-confirmed-001',
    patientId: 'patient-002',
    doctorId: 'doctor-001',
    appointmentTime: clinicTime(alignToWeekday(daysFromToday(3), DOCTOR_001_DOWS, 'forward'), '10:20'),
    status: 'CONFIRMED',
    confirmed: true,
    reservationStatus: 'RESERVED',
    reminders: [
      { type: 'CONFIRMATION_REMINDER', status: 'CANCELLED' }, // confirmed before the 24h reminder went out
      { type: 'UPCOMING_REMINDER', status: 'SCHEDULED' }
    ],
    transitions: ['REQUESTED', 'RESERVING', 'BOOKED', 'CONFIRMED']
  });

  await seedDemoAppointment({
    id: 'apt-demo-noresponse-001',
    patientId: 'patient-003',
    doctorId: 'doctor-002',
    appointmentTime: clinicTime(alignToWeekday(daysFromToday(-1), DOCTOR_002_DOWS, 'backward'), '08:00'),
    status: 'NO_RESPONSE',
    confirmed: false,
    reservationStatus: 'RELEASED',
    reminders: [
      { type: 'CONFIRMATION_REMINDER', status: 'SENT' },
      { type: 'UPCOMING_REMINDER', status: 'CANCELLED' }
    ],
    transitions: ['REQUESTED', 'RESERVING', 'BOOKED', 'NO_RESPONSE']
  });

  await seedDemoAppointment({
    id: 'apt-demo-cancelled-early-001',
    patientId: 'patient-001',
    doctorId: 'doctor-002',
    appointmentTime: clinicTime(alignToWeekday(daysFromToday(4), DOCTOR_002_DOWS, 'forward'), '14:00'),
    status: 'CANCELLED',
    confirmed: false,
    reservationStatus: 'RELEASED',
    reminders: [
      { type: 'CONFIRMATION_REMINDER', status: 'CANCELLED' },
      { type: 'UPCOMING_REMINDER', status: 'CANCELLED' }
    ],
    transitions: ['REQUESTED', 'RESERVING', 'BOOKED', 'CANCELLED']
  });

  await seedDemoAppointment({
    id: 'apt-demo-cancelled-late-001',
    patientId: 'patient-002',
    doctorId: 'doctor-001',
    appointmentTime: clinicTime(alignToWeekday(daysFromToday(-2), DOCTOR_001_DOWS, 'backward'), '13:00'),
    status: 'CANCELLED',
    confirmed: true,
    reservationStatus: 'RELEASED',
    reminders: [
      { type: 'CONFIRMATION_REMINDER', status: 'SENT' },
      { type: 'UPCOMING_REMINDER', status: 'CANCELLED' }
    ],
    transitions: ['REQUESTED', 'RESERVING', 'BOOKED', 'CONFIRMED', 'CANCELLED']
  });

  await seedDemoAppointment({
    id: 'apt-demo-completed-001',
    patientId: 'patient-003',
    doctorId: 'doctor-001',
    appointmentTime: clinicTime(alignToWeekday(daysFromToday(-5), DOCTOR_001_DOWS, 'backward'), '09:20'),
    status: 'COMPLETED',
    confirmed: true,
    reservationStatus: 'RELEASED',
    reminders: [
      { type: 'CONFIRMATION_REMINDER', status: 'SENT' },
      { type: 'UPCOMING_REMINDER', status: 'SENT' }
    ],
    transitions: ['REQUESTED', 'RESERVING', 'BOOKED', 'CONFIRMED', 'COMPLETED']
  });

  await seedDemoAppointment({
    id: 'apt-demo-noshow-001',
    patientId: 'patient-002',
    doctorId: 'doctor-002',
    appointmentTime: clinicTime(alignToWeekday(daysFromToday(-3), DOCTOR_002_DOWS, 'backward'), '09:00'),
    status: 'NO_SHOW',
    confirmed: true,
    reservationStatus: 'RELEASED',
    reminders: [
      { type: 'CONFIRMATION_REMINDER', status: 'SENT' },
      { type: 'UPCOMING_REMINDER', status: 'SENT' }
    ],
    transitions: ['REQUESTED', 'RESERVING', 'BOOKED', 'CONFIRMED', 'NO_SHOW']
  });

  // Deliberately 08:00 — before doctor-003's real 09:00 start — so this
  // reads as what it is: a request outside the doctor's hours, rejected
  // before a reservation was ever attempted (no SlotReservation row exists
  // for a REJECTED appointment in the real workflow either).
  await seedDemoAppointment({
    id: 'apt-demo-rejected-001',
    patientId: 'patient-001',
    doctorId: 'doctor-003',
    appointmentTime: clinicTime(alignToWeekday(daysFromToday(6), DOCTOR_003_DOWS, 'forward'), '08:00'),
    status: 'REJECTED',
    confirmed: false,
    reservationStatus: null,
    reminders: [],
    transitions: ['REQUESTED', 'REJECTED']
  });

  await seedDemoAppointment({
    id: 'apt-demo-bookingfailed-001',
    patientId: 'patient-002',
    doctorId: 'doctor-001',
    appointmentTime: clinicTime(alignToWeekday(daysFromToday(5), DOCTOR_001_DOWS, 'forward'), '08:20'),
    status: 'BOOKING_FAILED',
    confirmed: false,
    reservationStatus: 'CONFLICTED',
    reminders: [],
    transitions: ['REQUESTED', 'RESERVING', 'BOOKING_FAILED']
  });
}

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash('DemoPass123!', 12);

  await seedIdentities(passwordHash);
  await seedRecurringAvailability();
  await seedScheduleExceptions();
  await seedClinicClosures();
  await seedDemoAppointmentHistory();

  const nextDoctor001Day = dateOnlyString(alignToWeekday(daysFromToday(7), DOCTOR_001_DOWS, 'forward'));
  console.log(
    [
      '',
      '🌱  Seed complete: 3 patients, 3 doctors (each with a different recurring schedule),',
      '    2 schedule exceptions, 1 clinic closure, and 9 historical appointments covering',
      '    every terminal/non-terminal status.',
      '',
      '    The historical appointments are static rows for viewing dashboards/lookup only —',
      "    they have no live Temporal workflow behind them, so confirm/cancel/complete/no-show",
      '    will report WORKFLOW_NOT_READY against them. To exercise the real, live lifecycle',
      '    (24h reminder -> 6h deadline -> 2h reminder -> completion), book a fresh one, e.g.:',
      '',
      `    curl -s "http://localhost:3000/doctors/doctor-001/available-slots?date=${nextDoctor001Day}" \\`,
      "      -H \"authorization: Bearer $TOKEN\"",
      ''
    ].join('\n')
  );
}

main().finally(() => prisma.$disconnect());
