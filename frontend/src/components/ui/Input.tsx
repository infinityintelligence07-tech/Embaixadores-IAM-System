import clsx from 'clsx';
import { useLayoutEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';

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
  style,
  ...props
}: InputProps) {
  const inputId = id ?? props.name;
  const textLeading = typeof leading === 'string' || typeof leading === 'number';
  const leadingRef = useRef<HTMLSpanElement>(null);
  const [leadingWidth, setLeadingWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const node = leadingRef.current;
    if (!textLeading || !node) return;
    const measure = () => setLeadingWidth(node.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [textLeading, leading]);

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium leading-5 text-text">
        {label}
      </label>
      <div className="relative">
        {leading ? (
          <span
            className={clsx(
              'pointer-events-none absolute left-3.5 text-text-muted',
              textLeading
                ? 'top-1/2 -translate-y-1/2 text-sm leading-5 max-[640px]:text-base'
                : 'inset-y-0 flex items-center [&_svg]:size-4',
            )}
          >
            {textLeading ? <span ref={leadingRef}>{leading}</span> : leading}
          </span>
        ) : null}
        <input
          id={inputId}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={
            error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
          }
          className={clsx(
            'block min-h-[42px] w-full rounded-xl border bg-field px-3.5 py-2 text-sm text-text placeholder:text-text-muted',
            'disabled:cursor-not-allowed disabled:opacity-60',
            leading && !textLeading && 'pl-10',
            error
              ? 'border-danger'
              : 'border-field-line enabled:hover:border-[var(--field-line-hover)]',
            className,
          )}
          style={
            textLeading
              ? { paddingLeft: leadingWidth === null ? '2.25rem' : 14 + leadingWidth + 6, ...style }
              : style
          }
          {...props}
        />
      </div>
      {hint && !error ? (
        <p id={`${inputId}-hint`} className="text-xs leading-4 text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-xs leading-4 text-[var(--bad)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
