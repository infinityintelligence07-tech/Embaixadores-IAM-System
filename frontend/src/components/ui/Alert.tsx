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
  info: 'border-[var(--line)] bg-[var(--accent-soft)] text-[var(--ink)]',
  success: 'border-transparent bg-[var(--accent-soft)] text-[var(--ink)]',
  warning: 'border-transparent bg-[var(--warn-soft)] text-[var(--ink)]',
  error: 'border-transparent bg-[var(--bad-soft)] text-[var(--ink)]',
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
