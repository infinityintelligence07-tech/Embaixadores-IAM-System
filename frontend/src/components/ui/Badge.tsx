import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

type BadgeTone = 'neutral' | 'gold' | 'violet' | 'success' | 'warning' | 'danger';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-surface-elevated text-text-muted border-border',
  gold: 'bg-[var(--warn-soft)] text-[var(--gold)] border-transparent',
  violet: 'bg-[var(--accent-soft)] text-[var(--accent-2)] border-transparent',
  success: 'bg-[var(--accent-soft)] text-[var(--accent-2)] border-transparent',
  warning: 'bg-[var(--warn-soft)] text-[var(--warn)] border-transparent',
  danger: 'bg-[var(--bad-soft)] text-[var(--bad)] border-transparent',
};

export function Badge({ tone = 'neutral', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
