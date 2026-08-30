import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardX, UserX, XCircle } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../../components/ui/Button';
import { Alert } from '../../../components/ui/Alert';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../components/ui/ToastProvider';
import { describeError } from '../../../lib/apiError';
import {
  useCancelAppointmentMutation,
  useCompleteAppointmentMutation,
  useConfirmAppointmentMutation,
  useMarkNoShowMutation
} from '../hooks/useAppointmentMutations';
import { useSignalPolling } from '../hooks/useSignalPolling';
import { canActOnAppointment, canManageAsDoctor } from '../permissions';
import type { Appointment } from '../../../types/api';

type PendingAction = 'confirm' | 'cancel' | 'complete' | 'no-show' | null;

export function AppointmentActions({ appointment }: { appointment: Appointment }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [noShowDialogOpen, setNoShowDialogOpen] = useState(false);

  const confirmMutation = useConfirmAppointmentMutation(appointment.id);
  const cancelMutation = useCancelAppointmentMutation(appointment.id);
  const completeMutation = useCompleteAppointmentMutation(appointment.id);
  const noShowMutation = useMarkNoShowMutation(appointment.id);
  const signalPoll = useSignalPolling(appointment.id, pendingAction !== null);

  useEffect(() => {
    if (signalPoll.status === 'done' || signalPoll.status === 'exhausted') {
      setPendingAction(null);
    }
  }, [signalPoll.status]);

  if (!user) return null;
  const isBusy = pendingAction !== null;

  const patientCanAct = canActOnAppointment(user, appointment);
  const showConfirm = patientCanAct && appointment.status === 'BOOKED';
  const showCancel = patientCanAct && (appointment.status === 'BOOKED' || appointment.status === 'CONFIRMED');
  const doctorCanManage = canManageAsDoctor(user, appointment) && appointment.status === 'CONFIRMED';

  if (!showConfirm && !showCancel && !doctorCanManage) return null;

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

  const runComplete = async () => {
    try {
      await completeMutation.mutateAsync();
      setPendingAction('complete');
      showToast({ variant: 'success', title: 'Request accepted', description: 'Marking as completed is being processed.' });
    } catch (error) {
      showToast({ variant: 'error', title: 'Could not mark completed', description: describeError(error) });
    }
  };

  const runNoShow = async () => {
    setNoShowDialogOpen(false);
    try {
      await noShowMutation.mutateAsync();
      setPendingAction('no-show');
      showToast({ variant: 'success', title: 'Request accepted', description: 'Marking as no-show is being processed.' });
    } catch (error) {
      showToast({ variant: 'error', title: 'Could not mark no-show', description: describeError(error) });
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
        {showConfirm && (
          <Button onClick={runConfirm} disabled={isBusy} isLoading={confirmMutation.isPending}>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Confirm appointment
          </Button>
        )}
        {showCancel && (
          <Button
            variant="danger"
            onClick={() => setCancelDialogOpen(true)}
            disabled={isBusy}
            isLoading={cancelMutation.isPending}
          >
            <XCircle className="h-4 w-4" aria-hidden="true" />
            Cancel appointment
          </Button>
        )}
        {doctorCanManage && (
          <>
            <Button onClick={runComplete} disabled={isBusy} isLoading={completeMutation.isPending}>
              <ClipboardX className="h-4 w-4" aria-hidden="true" />
              Mark completed
            </Button>
            <Button
              variant="danger"
              onClick={() => setNoShowDialogOpen(true)}
              disabled={isBusy}
              isLoading={noShowMutation.isPending}
            >
              <UserX className="h-4 w-4" aria-hidden="true" />
              Mark no-show
            </Button>
          </>
        )}
      </div>

      {showCancel && (
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
      )}

      {doctorCanManage && (
        <ConfirmDialog
          open={noShowDialogOpen}
          title="Mark this appointment as no-show?"
          description="This will release the doctor's slot and cannot be undone."
          confirmLabel="Yes, mark no-show"
          cancelLabel="Keep as confirmed"
          isDestructive
          onConfirm={runNoShow}
          onCancel={() => setNoShowDialogOpen(false)}
        />
      )}
    </div>
  );
}
