import { describe, expect, it } from 'vitest';
import {
  APPOINTMENT_SLOT_MS,
  appointmentOverlapWindow,
  isAlignedAppointmentSlot
} from '../src/shared/appointmentSlots';

describe('20-minute appointment slot policy', () => {
  it('validates the caller wall-clock boundary rather than UTC minutes', () => {
    expect(isAlignedAppointmentSlot('2099-01-01T10:00:00+05:30')).toBe(true);
    expect(isAlignedAppointmentSlot('2099-01-01T10:20:00+05:30')).toBe(true);
    expect(isAlignedAppointmentSlot('2099-01-01T10:40:00+05:30')).toBe(true);
    expect(isAlignedAppointmentSlot('2099-01-01T10:30:00+05:30')).toBe(false);
  });

  it('builds strict overlap boundaries so adjacent slots remain available', () => {
    const start = new Date('2099-01-01T10:20:00Z');
    const window = appointmentOverlapWindow(start);
    expect(start.getTime() - window.after.getTime()).toBe(APPOINTMENT_SLOT_MS);
    expect(window.before.getTime() - start.getTime()).toBe(APPOINTMENT_SLOT_MS);

    const overlaps = (existingStart: Date) => existingStart > window.after && existingStart < window.before;
    expect(overlaps(new Date('2099-01-01T10:00:00Z'))).toBe(false);
    expect(overlaps(new Date('2099-01-01T10:10:00Z'))).toBe(true);
    expect(overlaps(new Date('2099-01-01T10:20:00Z'))).toBe(true);
    expect(overlaps(new Date('2099-01-01T10:30:00Z'))).toBe(true);
    expect(overlaps(new Date('2099-01-01T10:40:00Z'))).toBe(false);
  });
});
