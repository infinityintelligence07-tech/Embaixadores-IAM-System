import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  role?: 'alert' | 'status';
}

/* Sucesso usa o azul da marca: o verde fica reservado ao botão de ação. */
const variantClasses: Record<AlertVariant, string> = {
  info: 'border-[color-mix(in_srgb,var(--accent-ink)_24%,transparent)] bg-[var(--accent-soft)]',
  success: 'border-[color-mix(in_srgb,var(--accent-ink)_24%,transparent)] bg-[var(--accent-soft)]',
  warning: 'border-[color-mix(in_srgb,var(--warn)_30%,transparent)] bg-[var(--warn-soft)]',
  error: 'border-[color-mix(in_srgb,var(--bad)_30%,transparent)] bg-[var(--bad-soft)]',
};

const iconFor: Record<AlertVariant, { Icon: LucideIcon; className: string }> = {
  info: { Icon: Info, className: 'text-accent-ink' },
  success: { Icon: CheckCircle2, className: 'text-accent-ink' },
  warning: { Icon: AlertTriangle, className: 'text-[var(--warn)]' },
  error: { Icon: XCircle, className: 'text-[var(--bad)]' },
};

export function Alert({
  variant = 'info',
  title,
  children,
  role = 'status',
}: AlertProps) {
  const { Icon, className: iconClass } = iconFor[variant];

  return (
    <div
      role={role}
      className={clsx(
        'flex items-start gap-3 rounded-[14px] border px-4 py-3.5 text-sm leading-5 text-text',
        variantClasses[variant],
      )}
    >
      <Icon aria-hidden className={clsx('mt-px size-[18px] shrink-0', iconClass)} />
      <div className="min-w-0 flex-1">
        {title ? <p className="mb-1 font-semibold">{title}</p> : null}
        <div className="text-text [&_a]:font-semibold [&_a]:text-accent-ink [&_a]:underline [&_a]:underline-offset-4">
          {children}
        </div>
      </div>
    </div>
  );
}
