/**
 * Converts a clinic-local wall-clock date/time into the UTC instant it
 * represents, for an arbitrary IANA zone — no hardcoded numeric offset.
 * Uses the standard two-pass correction via Intl so DST-observing zones
 * resolve correctly too (Asia/Colombo has none, but this stays generic).
 */
export function zonedWallClockToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);

  const firstOffsetMinutes = timeZoneOffsetMinutesAt(naiveUtcMs, timeZone);
  const correctedMs = naiveUtcMs - firstOffsetMinutes * 60_000;

  // A second pass in case the first correction crossed a DST boundary.
  const secondOffsetMinutes = timeZoneOffsetMinutesAt(correctedMs, timeZone);
  return new Date(naiveUtcMs - secondOffsetMinutes * 60_000);
}

/** How far `timeZone`'s wall clock is ahead of UTC at the instant `epochMs`, in minutes. */
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

/** The day of week (0 = Sunday .. 6 = Saturday) of a plain "YYYY-MM-DD" calendar date — timezone-independent by construction. */
export function calendarDateDayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

const isoDateFormatterCache = new Map<string, Intl.DateTimeFormat>();

/** The clinic-local calendar date ("YYYY-MM-DD") that a UTC instant falls on in `timeZone`. */
export function utcInstantToZonedDate(instant: Date | string, timeZone: string): string {
  let formatter = isoDateFormatterCache.get(timeZone);
  if (!formatter) {
    // en-CA renders as YYYY-MM-DD, i.e. already the format this app uses everywhere else.
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    isoDateFormatterCache.set(timeZone, formatter);
  }
  return formatter.format(instant instanceof Date ? instant : new Date(instant));
}

/** The next plain calendar date after `date` ("YYYY-MM-DD"), independent of any timezone. */
export function nextCalendarDate(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
