import type { AppointmentStatus, WorkflowStatus } from '../../types/api';
import type { BadgeColor } from '../../components/ui/Badge';

export const dbStatusPresentation: Record<AppointmentStatus, { label: string; color: BadgeColor }> = {
  PENDING: { label: 'Pending', color: 'gray' },
  BOOKED: { label: 'Booked', color: 'blue' },
  CONFIRMED: { label: 'Confirmed', color: 'green' },
  CANCELLED: { label: 'Cancelled', color: 'red' },
  COMPLETED: { label: 'Completed', color: 'purple' }
};

export const workflowStatusPresentation: Record<WorkflowStatus, { label: string; color: BadgeColor; animated?: boolean }> = {
  BOOKING: { label: 'Booking', color: 'gray', animated: true },
  SCHEDULED: { label: 'Scheduled', color: 'blue' },
  WAITING_FOR_CONFIRMATION: { label: 'Waiting for confirmation', color: 'amber' },
  CONFIRMED: { label: 'Confirmed', color: 'green' },
  CANCELLED: { label: 'Cancelled', color: 'red' },
  FAILED: { label: 'Failed', color: 'red' }
};
