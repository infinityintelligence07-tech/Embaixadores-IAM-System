import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

type BadgeTone = 'neutral' | 'gold' | 'violet' | 'success' | 'warning' | 'danger';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-surface-elevated text-text-muted border-field-line',
  gold: 'bg-[color-mix(in_srgb,var(--gold)_14%,transparent)] text-[var(--gold)] border-[color-mix(in_srgb,var(--gold)_30%,transparent)]',
  violet: 'bg-[var(--accent-soft)] text-accent-ink border-[color-mix(in_srgb,var(--accent-ink)_24%,transparent)]',
  success: 'bg-[var(--accent-soft)] text-accent-ink border-[color-mix(in_srgb,var(--accent-ink)_24%,transparent)]',
  warning: 'bg-[var(--warn-soft)] text-[var(--warn)] border-[color-mix(in_srgb,var(--warn)_30%,transparent)]',
  danger: 'bg-[var(--bad-soft)] text-[var(--bad)] border-[color-mix(in_srgb,var(--bad)_30%,transparent)]',
};

export function Badge({ tone = 'neutral', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5 [&_svg]:size-3.5 [&_svg]:shrink-0',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
