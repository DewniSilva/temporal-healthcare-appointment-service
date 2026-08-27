import { describe, expect, it } from 'vitest';
import { createAppointmentSchema, idempotencyKeySchema } from '../src/backend/api/appointment.schema';
import { appointmentIdForIdempotencyKey } from '../src/backend/api/idempotency';
import { assertCanAct, assertCanCreate, assertCanRead } from '../src/backend/auth/authorization';
import { AppError } from '../src/backend/api/errors';

const appointment = { id: 'apt-1', patientId: 'patient-001', doctorId: 'doctor-001', status: 'BOOKED' as const };

describe('request validation and authorization', () => {
  it('accepts a future ISO appointment and rejects unexpected fields', () => {
    const valid = { patientId: 'patient-001', doctorId: 'doctor-001', appointmentTime: '2099-01-01T10:20:00Z' };
    expect(createAppointmentSchema.parse(valid).patientId).toBe('patient-001');
    expect(() => createAppointmentSchema.parse({ ...valid, diagnosis: 'must not enter workflow history' })).toThrow();
  });

  it('rejects malformed and past appointment input', () => {
    expect(() => createAppointmentSchema.parse({ patientId: '../patient', doctorId: 'doctor-001', appointmentTime: 'not-a-date' })).toThrow();
    expect(() => createAppointmentSchema.parse({ patientId: 'patient-001', doctorId: 'doctor-001', appointmentTime: new Date(0).toISOString() })).toThrow();
  });

  it('accepts only 20-minute wall-clock boundaries, including half-hour timezones', () => {
    const base = { patientId: 'patient-001', doctorId: 'doctor-001' };
    expect(() => createAppointmentSchema.parse({ ...base, appointmentTime: '2099-01-01T10:20:00+05:30' })).not.toThrow();
    expect(() => createAppointmentSchema.parse({ ...base, appointmentTime: '2099-01-01T10:10:00+05:30' })).toThrow(/20-minute boundary/);
    expect(() => createAppointmentSchema.parse({ ...base, appointmentTime: '2099-01-01T10:20:30+05:30' })).toThrow(/20-minute boundary/);
  });

  it('requires a valid idempotency key and derives stable caller-scoped IDs', () => {
    expect(() => idempotencyKeySchema.parse(undefined)).toThrow();
    expect(() => idempotencyKeySchema.parse('short')).toThrow();
    expect(idempotencyKeySchema.parse('booking-request-001')).toBe('booking-request-001');

    const first = appointmentIdForIdempotencyKey('user-001', 'booking-request-001');
    expect(appointmentIdForIdempotencyKey('user-001', 'booking-request-001')).toBe(first);
    expect(appointmentIdForIdempotencyKey('user-002', 'booking-request-001')).not.toBe(first);
  });

  it('enforces patient ownership for create, read and state changes', () => {
    const owner = { userId: 'u1', role: 'PATIENT' as const, patientId: 'patient-001' };
    const stranger = { userId: 'u2', role: 'PATIENT' as const, patientId: 'patient-002' };
    expect(() => assertCanCreate(owner, 'patient-001')).not.toThrow();
    expect(() => assertCanRead(owner, appointment)).not.toThrow();
    expect(() => assertCanAct(owner, appointment)).not.toThrow();
    for (const assertion of [() => assertCanCreate(stranger, 'patient-001'), () => assertCanRead(stranger, appointment), () => assertCanAct(stranger, appointment)]) {
      expect(assertion).toThrowError(AppError);
    }
  });

  it('allows the assigned doctor to read but not change patient state', () => {
    const doctor = { userId: 'd1', role: 'DOCTOR' as const, doctorId: 'doctor-001' };
    expect(() => assertCanRead(doctor, appointment)).not.toThrow();
    expect(() => assertCanAct(doctor, appointment)).toThrowError(AppError);
  });

  it('allows an admin to manage any appointment', () => {
    const admin = { userId: 'a1', role: 'ADMIN' as const };
    expect(() => assertCanCreate(admin, 'patient-001')).not.toThrow();
    expect(() => assertCanRead(admin, appointment)).not.toThrow();
    expect(() => assertCanAct(admin, appointment)).not.toThrow();
  });
});
