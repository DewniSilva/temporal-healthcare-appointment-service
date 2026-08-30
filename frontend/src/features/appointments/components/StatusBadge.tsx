import { Badge } from '../../../components/ui/Badge';
import type { AppointmentStatus } from '../../../types/api';
import { dbStatusPresentation } from '../statusPresentation';

export function DbStatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, color, animated } = dbStatusPresentation[status];
  return (
    <Badge color={color} animated={animated}>
      {label}
    </Badge>
  );
}

// The Workflow query now reports the same AppointmentStatus enum as the DB
// record (appointmentStatus), so this shares the identical presentation map.
export function WorkflowStatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, color, animated } = dbStatusPresentation[status];
  return (
    <Badge color={color} animated={animated}>
      {label}
    </Badge>
  );
}
