import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-field-line bg-surface-card px-6 py-10 text-center"
    >
      {icon ? (
        <div
          className="mb-4 flex size-12 items-center justify-center rounded-full bg-[var(--accent-soft)] text-accent-ink [&_svg]:size-6"
          aria-hidden
        >
          {icon}
        </div>
      ) : null}
      <h3 className="font-display text-lg font-semibold leading-6 text-text">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-5 text-text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2.5">{action}</div> : null}
    </div>
  );
}
