import type { AppointmentStatus } from '../../types/api';
import type { BadgeColor } from '../../components/ui/Badge';

// One presentation map for the single AppointmentStatus enum now shared by
// both the DB record and the Workflow query — see DbStatusBadge/WorkflowStatusBadge.
export const dbStatusPresentation: Record<AppointmentStatus, { label: string; color: BadgeColor; animated?: boolean }> = {
  REQUESTED: { label: 'Requested', color: 'gray', animated: true },
  RESERVING: { label: 'Reserving slot', color: 'gray', animated: true },
  BOOKED: { label: 'Booked', color: 'blue' },
  CONFIRMED: { label: 'Confirmed', color: 'green' },
  NO_RESPONSE: { label: 'No response', color: 'amber' },
  CANCELLED: { label: 'Cancelled', color: 'red' },
  COMPLETED: { label: 'Completed', color: 'purple' },
  NO_SHOW: { label: 'No-show', color: 'amber' },
  REJECTED: { label: 'Rejected', color: 'red' },
  BOOKING_FAILED: { label: 'Booking failed', color: 'red' }
};
