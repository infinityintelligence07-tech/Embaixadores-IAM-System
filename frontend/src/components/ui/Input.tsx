import clsx from 'clsx';
import type { InputHTMLAttributes, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  leading?: ReactNode;
}

export function Input({
  label,
  hint,
  error,
  leading,
  id,
  className,
  ...props
}: InputProps) {
  const inputId = id ?? props.name;

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-text">
        {label}
      </label>
      <div className="relative">
        {leading ? (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-muted">
            {leading}
          </span>
        ) : null}
        <input
          id={inputId}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={
            error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
          }
          className={clsx(
            'w-full rounded-xl border bg-surface-elevated px-3 py-2.5 text-sm text-text placeholder:text-text-muted',
            'border-border focus:border-brand-violet',
            leading && 'pl-10',
            error && 'border-danger',
            className,
          )}
          {...props}
        />
      </div>
      {hint && !error ? (
        <p id={`${inputId}-hint`} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
