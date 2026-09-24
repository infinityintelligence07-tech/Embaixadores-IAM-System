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
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface-card px-6 py-10 text-center"
    >
      {icon ? (
        <div className="mb-3 text-brand-gold" aria-hidden>
          {icon}
        </div>
      ) : null}
      <h3 className="font-display text-lg text-text">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm text-text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
