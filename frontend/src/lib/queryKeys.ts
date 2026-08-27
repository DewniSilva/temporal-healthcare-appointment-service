export const queryKeys = {
  health: () => ['health'] as const,
  appointment: (id: string) => ['appointment', id] as const,
  appointmentWorkflow: (id: string) => ['appointment', id, 'workflow'] as const
};
