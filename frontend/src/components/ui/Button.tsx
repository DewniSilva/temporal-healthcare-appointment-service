import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
}

const baseClasses = [
  'inline-flex items-center justify-center gap-2',
  'rounded-lg font-semibold transition-colors',
  'focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed'
].join(' ');

const variantClasses: Record<Variant, string> = {
  primary: [
    'bg-primary-600 text-white hover:bg-primary-700',
    'focus-visible:ring-primary-500 disabled:bg-primary-300'
  ].join(' '),
  secondary: [
    'bg-white text-slate-700 border border-slate-300',
    'hover:bg-slate-50 focus-visible:ring-primary-500',
    'disabled:text-slate-400'
  ].join(' '),
  danger: [
    'bg-red-600 text-white hover:bg-red-700',
    'focus-visible:ring-red-500 disabled:bg-red-300'
  ].join(' '),
  ghost: [
    'bg-transparent text-slate-600 hover:bg-slate-100',
    'focus-visible:ring-primary-500 disabled:text-slate-300'
  ].join(' ')
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm'
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      className = '',
      children,
      ...rest
    },
    ref
  ) {
    const classes = [
      baseClasses,
      variantClasses[variant],
      sizeClasses[size],
      className
    ].join(' ');

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={classes}
        {...rest}
      >
        {isLoading && (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        {children}
      </button>
    );
  }
);
