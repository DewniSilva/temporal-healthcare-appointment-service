import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../../components/ui/Button';
import { Alert } from '../../../components/ui/Alert';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../components/ui/ToastProvider';
import { describeError } from '../../../lib/apiError';
import {
  useCancelAppointmentMutation,
  useConfirmAppointmentMutation
} from '../hooks/useAppointmentMutations';
import { useSignalPolling } from '../hooks/useSignalPolling';
import { canActOnAppointment } from '../permissions';
import type { Appointment } from '../../../types/api';

export function AppointmentActions({ appointment }: { appointment: Appointment }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [pendingAction, setPendingAction] = useState<'confirm' | 'cancel' | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const confirmMutation = useConfirmAppointmentMutation(appointment.id);
  const cancelMutation = useCancelAppointmentMutation(appointment.id);
  const signalPoll = useSignalPolling(appointment.id, pendingAction !== null);

  useEffect(() => {
    if (signalPoll.status === 'done' || signalPoll.status === 'exhausted') {
      setPendingAction(null);
    }
  }, [signalPoll.status]);

  if (!user) return null;
  if (user.role === 'DOCTOR') return null;
  if (!canActOnAppointment(user, appointment)) return null;
  if (appointment.status !== 'BOOKED') return null;

  const isBusy = pendingAction !== null;

  const runConfirm = async () => {
    try {
      await confirmMutation.mutateAsync();
      setPendingAction('confirm');
      showToast({ variant: 'success', title: 'Request accepted', description: 'Confirmation is being processed.' });
    } catch (error) {
      showToast({ variant: 'error', title: 'Could not confirm', description: describeError(error) });
    }
  };

  const runCancel = async () => {
    setCancelDialogOpen(false);
    try {
      await cancelMutation.mutateAsync();
      setPendingAction('cancel');
      showToast({ variant: 'success', title: 'Request accepted', description: 'Cancellation is being processed.' });
    } catch (error) {
      showToast({ variant: 'error', title: 'Could not cancel', description: describeError(error) });
    }
  };

  return (
    <div className="mt-6 border-t border-slate-200 pt-6">
      {isBusy && (
        <div className="mb-4">
          <Alert variant="info" title="Request accepted">
            Waiting for the workflow to report the updated status.
          </Alert>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button onClick={runConfirm} disabled={isBusy} isLoading={confirmMutation.isPending}>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Confirm appointment
        </Button>
        <Button
          variant="danger"
          onClick={() => setCancelDialogOpen(true)}
          disabled={isBusy}
          isLoading={cancelMutation.isPending}
        >
          <XCircle className="h-4 w-4" aria-hidden="true" />
          Cancel appointment
        </Button>
      </div>

      <ConfirmDialog
        open={cancelDialogOpen}
        title="Cancel this appointment?"
        description="This will release the doctor's slot and cannot be undone."
        confirmLabel="Yes, cancel appointment"
        cancelLabel="Keep appointment"
        isDestructive
        onConfirm={runCancel}
        onCancel={() => setCancelDialogOpen(false)}
      />
    </div>
  );
}
