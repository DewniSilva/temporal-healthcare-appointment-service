export const APPOINTMENT_SLOT_MINUTES = 20;

interface WorkingHourRange {
  startHour: number;
  endHour: number;
}

// 7:00 AM–12:00 PM and 1:00 PM–5:00 PM.
const WORKING_HOUR_RANGES: WorkingHourRange[] = [
  { startHour: 7, endHour: 12 },
  { startHour: 13, endHour: 17 }
];

const timeLabelFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit'
});

export interface AppointmentTimeSlot {
  value: string;
  label: string;
}

function buildSlot(startMinutes: number): AppointmentTimeSlot {
  const hour = Math.floor(startMinutes / 60);
  const minute = startMinutes % 60;
  const start = new Date(2000, 0, 2, hour, minute);
  const end = new Date(2000, 0, 2, 0, startMinutes + APPOINTMENT_SLOT_MINUTES);
  const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return {
    value,
    label: `${timeLabelFormatter.format(start)} – ${timeLabelFormatter.format(end)}`
  };
}

export const appointmentTimeSlots: AppointmentTimeSlot[] = WORKING_HOUR_RANGES.flatMap((range) => {
  const slotsInRange = ((range.endHour - range.startHour) * 60) / APPOINTMENT_SLOT_MINUTES;
  return Array.from({ length: slotsInRange }, (_, index) =>
    buildSlot(range.startHour * 60 + index * APPOINTMENT_SLOT_MINUTES)
  );
});

export function isTwentyMinuteTimeSlot(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):(?:00|20|40)$/.test(value);
}

export function isWithinWorkingHours(value: string): boolean {
  const hour = Number(value.slice(0, 2));
  return WORKING_HOUR_RANGES.some((range) => hour >= range.startHour && hour < range.endHour);
}
