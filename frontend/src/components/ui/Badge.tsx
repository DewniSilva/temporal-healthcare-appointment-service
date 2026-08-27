import type { ReactNode } from 'react';

export type BadgeColor = 'gray' | 'blue' | 'green' | 'red' | 'purple' | 'amber';

const colorClasses: Record<BadgeColor, string> = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  blue: 'bg-primary-100 text-primary-800 ring-primary-500/20',
  green: 'bg-emerald-100 text-emerald-800 ring-emerald-500/20',
  red: 'bg-red-100 text-red-800 ring-red-500/20',
  purple: 'bg-purple-100 text-purple-800 ring-purple-500/20',
  amber: 'bg-amber-100 text-amber-800 ring-amber-500/20'
};

interface BadgeProps {
  color?: BadgeColor;
  icon?: ReactNode;
  animated?: boolean;
  children: ReactNode;
}

export function Badge({ color = 'gray', icon, animated = false, children }: BadgeProps) {
  const wrapperClasses = [
    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1',
    'text-xs font-semibold ring-1 ring-inset',
    colorClasses[color]
  ].join(' ');

  const dotClasses = [
    'h-1.5 w-1.5 rounded-full bg-current',
    animated ? 'animate-pulse motion-reduce:animate-none' : ''
  ].join(' ');

  return (
    <span className={wrapperClasses}>
      {icon ?? <span className={dotClasses} aria-hidden="true" />}
      {children}
    </span>
  );
}
