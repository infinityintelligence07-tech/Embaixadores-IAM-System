import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

type BadgeTone = 'neutral' | 'gold' | 'violet' | 'success' | 'warning' | 'danger';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-surface-elevated text-text-muted border-border',
  gold: 'bg-brand-gold/15 text-brand-gold border-brand-gold/40',
  violet: 'bg-brand-violet/15 text-violet-200 border-brand-violet/40',
  success: 'bg-success/15 text-green-200 border-success/40',
  warning: 'bg-warning/15 text-amber-200 border-warning/40',
  danger: 'bg-danger/15 text-red-200 border-danger/40',
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
