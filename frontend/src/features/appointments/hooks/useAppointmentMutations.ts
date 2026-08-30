import { useMutation } from '@tanstack/react-query';
import { cancelAppointment, completeAppointment, confirmAppointment, createAppointment, markNoShow } from '../api';
import type { CreateAppointmentRequest } from '../../../types/api';

export function useCreateAppointmentMutation() {
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: CreateAppointmentRequest; idempotencyKey: string }) =>
      createAppointment(input, idempotencyKey)
  });
}

export function useConfirmAppointmentMutation(appointmentId: string) {
  return useMutation({ mutationFn: () => confirmAppointment(appointmentId) });
}

export function useCancelAppointmentMutation(appointmentId: string) {
  return useMutation({ mutationFn: () => cancelAppointment(appointmentId) });
}

export function useCompleteAppointmentMutation(appointmentId: string) {
  return useMutation({ mutationFn: () => completeAppointment(appointmentId) });
}

export function useMarkNoShowMutation(appointmentId: string) {
  return useMutation({ mutationFn: () => markNoShow(appointmentId) });
}
