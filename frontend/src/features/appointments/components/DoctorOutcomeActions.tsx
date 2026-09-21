import { useState } from 'react';
import { ClipboardCheck, UserX } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../components/ui/ToastProvider';
import { describeError } from '../../../lib/apiError';
import { useCompleteAppointmentMutation, useMarkNoShowMutation } from '../hooks/useAppointmentMutations';
import type { AppointmentListItem } from '../../../types/api';

export function DoctorOutcomeActions({ appointment }: { appointment: AppointmentListItem }) {
  const [dialog, setDialog] = useState<'complete' | 'no-show' | null>(null);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const complete = useCompleteAppointmentMutation(appointment.id);
  const noShow = useMarkNoShowMutation(appointment.id);
  if (appointment.status !== 'CONFIRMED' || new Date(appointment.appointmentTime) > new Date()) return null;

  const submit = async () => {
    if (!dialog) return;
    try {
      if (dialog === 'complete') await complete.mutateAsync();
      else await noShow.mutateAsync();
      setDialog(null);
      showToast({ variant: 'success', title: 'Request accepted', description: 'The appointment outcome is being processed.' });
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['appointments'] }), 1_500);
    } catch (error) {
      showToast({ variant: 'error', title: 'Could not update appointment', description: describeError(error) });
    }
  };

  return (
    <>
      <div className="flex shrink-0 gap-1">
        <Button size="sm" variant="secondary" aria-label="Mark appointment completed" onClick={() => setDialog('complete')} isLoading={complete.isPending}><ClipboardCheck className="h-4 w-4" aria-hidden="true" /></Button>
        <Button size="sm" variant="danger" aria-label="Mark appointment no-show" onClick={() => setDialog('no-show')} isLoading={noShow.isPending}><UserX className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
      <ConfirmDialog open={dialog !== null} title={dialog === 'complete' ? 'Mark appointment completed?' : 'Mark appointment as no-show?'} description="This outcome cannot be undone." confirmLabel={dialog === 'complete' ? 'Mark completed' : 'Mark no-show'} cancelLabel="Cancel" isDestructive={dialog === 'no-show'} onConfirm={() => void submit()} onCancel={() => setDialog(null)} />
    </>
  );
}
