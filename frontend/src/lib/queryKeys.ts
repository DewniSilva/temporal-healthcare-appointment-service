export const queryKeys = {
  health: () => ['health'] as const,
  appointment: (id: string) => ['appointment', id] as const,
  appointmentWorkflow: (id: string) => ['appointment', id, 'workflow'] as const,
  availableSlots: (doctorId: string, date: string) => ['availableSlots', doctorId, date] as const
};
