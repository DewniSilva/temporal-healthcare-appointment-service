import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bookingFormSchema } from './bookingSchema';

// A fixed 10:00 AM keeps this inside the working-hours window regardless of
// the faked "now"; only the date needs to move forward.
function futureDateParts(daysFromNow: number): { date: string; time: string } {
  const future = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}`,
    time: '10:00'
  };
}

describe('bookingFormSchema', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts valid IDs and a future date/time', () => {
    const result = bookingFormSchema.safeParse({
      patientId: 'patient-001',
      doctorId: 'doctor-001',
      ...futureDateParts(2)
    });
    expect(result.success).toBe(true);
  });

  it('rejects a past date/time', () => {
    const result = bookingFormSchema.safeParse({
      patientId: 'patient-001',
      doctorId: 'doctor-001',
      date: '2020-01-01',
      time: '09:00'
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('time'))).toBe(true);
    }
  });

  it('rejects a time that is not aligned to a 20-minute slot', () => {
    const result = bookingFormSchema.safeParse({
      patientId: 'patient-001',
      doctorId: 'doctor-001',
      date: '2099-01-01',
      time: '09:10'
    });
    expect(result.success).toBe(false);
  });

  it('rejects patient/doctor IDs with unsupported characters', () => {
    const result = bookingFormSchema.safeParse({
      patientId: 'patient 001!',
      doctorId: 'doctor-001',
      ...futureDateParts(1)
    });
    expect(result.success).toBe(false);
  });

  it('rejects IDs that are too short', () => {
    const result = bookingFormSchema.safeParse({
      patientId: 'ab',
      doctorId: 'doctor-001',
      ...futureDateParts(1)
    });
    expect(result.success).toBe(false);
  });
});
