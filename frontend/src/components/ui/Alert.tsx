import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertConfig {
  icon: typeof Info;
  classes: string;
  label: string;
}

const config: Record<AlertVariant, AlertConfig> = {
  info: {
    icon: Info,
    classes: 'bg-primary-50 border-primary-200 text-primary-900',
    label: 'Info'
  },
  success: {
    icon: CheckCircle2,
    classes: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    label: 'Success'
  },
  warning: {
    icon: AlertTriangle,
    classes: 'bg-amber-50 border-amber-200 text-amber-900',
    label: 'Warning'
  },
  error: {
    icon: XCircle,
    classes: 'bg-red-50 border-red-200 text-red-900',
    label: 'Error'
  }
};

interface AlertProps {
  variant?: AlertVariant;
  title?: ReactNode;
  children: ReactNode;
}

export function Alert({ variant = 'info', title, children }: AlertProps) {
  const { icon: Icon, classes, label } = config[variant];
  const role = variant === 'error' || variant === 'warning' ? 'alert' : 'status';
  const wrapperClasses = `flex gap-3 rounded-lg border p-4 text-sm ${classes}`;

  return (
    <div role={role} className={wrapperClasses}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <span className="sr-only">{label}: </span>
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? 'mt-1' : ''}>{children}</div>
      </div>
    </div>
  );
}
