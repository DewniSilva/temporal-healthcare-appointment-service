import { History } from 'lucide-react';
import { AppointmentCard } from './AppointmentCard';
import { EmptyState } from '../../../components/ui/EmptyState';
import type { RecentAppointmentEntry } from '../recentAppointments';

interface RecentAppointmentsListProps {
  entries: RecentAppointmentEntry[];
  emptyDescription: string;
}

export function RecentAppointmentsList({ entries, emptyDescription }: RecentAppointmentsListProps) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No recent appointments on this device"
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <AppointmentCard key={entry.id} appointmentId={entry.id} />
      ))}
    </div>
  );
}
