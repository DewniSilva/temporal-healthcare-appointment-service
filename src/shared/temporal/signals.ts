import { defineSignal } from '@temporalio/workflow';

export const confirmAppointment = defineSignal('confirmAppointment');
export const cancelAppointment = defineSignal('cancelAppointment');
