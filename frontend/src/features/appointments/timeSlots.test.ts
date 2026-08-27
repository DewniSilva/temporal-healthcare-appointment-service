import { describe, expect, it } from 'vitest';
import { appointmentTimeSlots, isTwentyMinuteTimeSlot, isWithinWorkingHours } from './timeSlots';

describe('working-hours appointment slots', () => {
  it('provides only working-hours slots in 20-minute increments', () => {
    expect(appointmentTimeSlots).toHaveLength(27);
    expect(appointmentTimeSlots[0].value).toBe('07:00');
    expect(appointmentTimeSlots.at(-1)?.value).toBe('16:40');
    expect(appointmentTimeSlots.some((slot) => slot.value.startsWith('12:'))).toBe(false);
    expect(appointmentTimeSlots.some((slot) => slot.value.startsWith('06:'))).toBe(false);
    expect(appointmentTimeSlots.some((slot) => slot.value.startsWith('17:'))).toBe(false);
  });

  it('rejects arbitrary minute values', () => {
    expect(isTwentyMinuteTimeSlot('10:00')).toBe(true);
    expect(isTwentyMinuteTimeSlot('10:20')).toBe(true);
    expect(isTwentyMinuteTimeSlot('10:40')).toBe(true);
    expect(isTwentyMinuteTimeSlot('10:10')).toBe(false);
  });

  it('accepts only the two working-hours windows', () => {
    expect(isWithinWorkingHours('07:00')).toBe(true);
    expect(isWithinWorkingHours('11:40')).toBe(true);
    expect(isWithinWorkingHours('12:00')).toBe(false);
    expect(isWithinWorkingHours('13:00')).toBe(true);
    expect(isWithinWorkingHours('16:40')).toBe(true);
    expect(isWithinWorkingHours('17:00')).toBe(false);
    expect(isWithinWorkingHours('06:40')).toBe(false);
  });
});
