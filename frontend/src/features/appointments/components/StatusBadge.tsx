import { Badge } from '../../../components/ui/Badge';
import type { AppointmentStatus, WorkflowStatus } from '../../../types/api';
import { dbStatusPresentation, workflowStatusPresentation } from '../statusPresentation';

export function DbStatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, color } = dbStatusPresentation[status];
  return <Badge color={color}>{label}</Badge>;
}

export function WorkflowStatusBadge({ status }: { status: WorkflowStatus }) {
  const { label, color, animated } = workflowStatusPresentation[status];
  return (
    <Badge color={color} animated={animated}>
      {label}
    </Badge>
  );
}
