import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

const wrapperClasses = [
  'flex flex-col items-center rounded-xl2',
  'border border-dashed border-slate-300 bg-slate-50',
  'px-6 py-10 text-center'
].join(' ');

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className={wrapperClasses}>
      <Icon className="h-8 w-8 text-slate-400" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold text-slate-700">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
