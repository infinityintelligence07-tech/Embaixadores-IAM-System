import clsx from 'clsx';
import type { ReactNode } from 'react';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  role?: 'alert' | 'status';
}

const variantClasses: Record<AlertVariant, string> = {
  info: 'border-brand-violet/40 bg-brand-violet/10 text-violet-100',
  success: 'border-success/40 bg-success/10 text-green-100',
  warning: 'border-warning/40 bg-warning/10 text-amber-100',
  error: 'border-danger/40 bg-danger/10 text-red-100',
};

export function Alert({
  variant = 'info',
  title,
  children,
  role = 'status',
}: AlertProps) {
  return (
    <div
      role={role}
      className={clsx('rounded-xl border px-4 py-3 text-sm', variantClasses[variant])}
    >
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div>{children}</div>
    </div>
  );
}
