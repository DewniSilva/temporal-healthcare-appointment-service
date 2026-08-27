import { AlertCircle, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import type { AppointmentStatus, AppointmentWorkflowState } from '../../../types/api';
import { buildTimelineSteps, type StepState } from '../timelineSteps';

const stepIcon: Record<StepState, typeof Circle> = {
  complete: CheckCircle2,
  current: Loader2,
  upcoming: Circle,
  error: AlertCircle
};

const stepIconClasses: Record<StepState, string> = {
  complete: 'text-emerald-600',
  current: 'text-primary-600 animate-spin motion-reduce:animate-none',
  upcoming: 'text-slate-300',
  error: 'text-red-600'
};

const stepTextClasses: Record<StepState, string> = {
  complete: 'text-slate-900',
  current: 'text-primary-700',
  upcoming: 'text-slate-400',
  error: 'text-red-700'
};

const stepStatusLabel: Record<StepState, string> = {
  complete: 'Done',
  current: 'In progress',
  upcoming: 'Not started yet',
  error: 'Failed'
};

interface TimelineProps {
  dbStatus: AppointmentStatus;
  workflow: AppointmentWorkflowState | null;
}

export function Timeline({ dbStatus, workflow }: TimelineProps) {
  const steps = buildTimelineSteps(dbStatus, workflow);

  return (
    <ol className="space-y-4">
      {steps.map((step) => {
        const Icon = stepIcon[step.state];
        return (
          <li key={step.key} className="flex items-center gap-3">
            <Icon className={`h-5 w-5 shrink-0 ${stepIconClasses[step.state]}`} aria-hidden="true" />
            <span className={`text-sm font-medium ${stepTextClasses[step.state]}`}>{step.label}</span>
            <span className="text-xs text-slate-400">({stepStatusLabel[step.state]})</span>
          </li>
        );
      })}
    </ol>
  );
}
