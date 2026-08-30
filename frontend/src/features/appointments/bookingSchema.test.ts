import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bookingFormSchema } from './bookingSchema';

describe('bookingFormSchema', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts valid IDs and a future slot', () => {
    const result = bookingFormSchema.safeParse({
      patientId: 'patient-001',
      doctorId: 'doctor-001',
      date: '2026-09-01',
      time: '2026-09-01T10:00:00.000Z'
    });
    expect(result.success).toBe(true);
  });

  it('rejects a slot that is no longer in the future', () => {
    const result = bookingFormSchema.safeParse({
      patientId: 'patient-001',
      doctorId: 'doctor-001',
      date: '2020-01-01',
      time: '2020-01-01T09:00:00.000Z'
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('time'))).toBe(true);
    }
  });

  it('rejects a missing time selection', () => {
    const result = bookingFormSchema.safeParse({
      patientId: 'patient-001',
      doctorId: 'doctor-001',
      date: '2026-09-01',
      time: ''
    });
    expect(result.success).toBe(false);
  });

  it('rejects patient/doctor IDs with unsupported characters', () => {
    const result = bookingFormSchema.safeParse({
      patientId: 'patient 001!',
      doctorId: 'doctor-001',
      date: '2026-09-01',
      time: '2026-09-01T10:00:00.000Z'
    });
    expect(result.success).toBe(false);
  });

  it('rejects IDs that are too short', () => {
    const result = bookingFormSchema.safeParse({
      patientId: 'ab',
      doctorId: 'doctor-001',
      date: '2026-09-01',
      time: '2026-09-01T10:00:00.000Z'
    });
    expect(result.success).toBe(false);
  });
});
