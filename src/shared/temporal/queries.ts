import { defineQuery } from '@temporalio/workflow';
import type { AppointmentWorkflowState } from './contracts';

export const appointmentStateQuery = defineQuery<AppointmentWorkflowState>('appointmentState');
