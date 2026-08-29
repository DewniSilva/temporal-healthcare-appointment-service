import { defineSignal } from '@temporalio/workflow';

export const confirmAppointment = defineSignal('confirmAppointment');
export const cancelAppointment = defineSignal('cancelAppointment');
export const markAppointmentCompleted = defineSignal('markAppointmentCompleted');
export const markAppointmentNoShow = defineSignal('markAppointmentNoShow');
