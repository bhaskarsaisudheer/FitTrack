import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  children: ReactNode;
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-accent text-slate-950 hover:bg-accent-strong active:bg-accent-dim disabled:bg-accent-dim/40',
  secondary:
    'bg-surface-hover text-ink border border-border-subtle hover:border-accent/40 disabled:opacity-50',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-hover hover:text-ink disabled:opacity-50',
  danger: 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25 disabled:opacity-50',
};

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  // Every size keeps a 44px minimum touch target.
  sm: 'min-h-[44px] px-3 text-sm',
  md: 'min-h-[48px] px-4 text-sm',
  lg: 'min-h-[56px] px-6 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
