// The backend has no GET /appointments list endpoint, so "recent
// appointments" is a per-device convenience built entirely from IDs the
// current browser has created or looked up. It is never a full history.

const STORAGE_KEY = 'healthcare.recentAppointments';
const MAX_ENTRIES = 20;

export interface RecentAppointmentEntry {
  id: string;
  savedAt: string;
}

function readAll(): RecentAppointmentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is RecentAppointmentEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as RecentAppointmentEntry).id === 'string' &&
        typeof (entry as RecentAppointmentEntry).savedAt === 'string'
    );
  } catch {
    return [];
  }
}

function writeAll(entries: RecentAppointmentEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage may be unavailable; recent appointments simply will not persist.
  }
}

export function listRecentAppointments(): RecentAppointmentEntry[] {
  return readAll().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Records that this browser created or viewed an appointment, most-recent first. */
export function rememberAppointment(id: string): void {
  const entries = readAll().filter((entry) => entry.id !== id);
  entries.unshift({ id, savedAt: new Date().toISOString() });
  writeAll(entries.slice(0, MAX_ENTRIES));
}

export function forgetAppointment(id: string): void {
  writeAll(readAll().filter((entry) => entry.id !== id));
}
