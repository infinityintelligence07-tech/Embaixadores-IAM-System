import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-violet text-white border border-transparent enabled:hover:bg-brand-violet-muted',
  secondary:
    'bg-surface-card text-text border border-field-line enabled:hover:border-[var(--field-line-hover)] enabled:hover:bg-[var(--accent-soft)]',
  ghost:
    'bg-transparent text-text-muted border border-transparent enabled:hover:bg-[var(--accent-soft)] enabled:hover:text-text',
  danger:
    'bg-[var(--bad-soft)] text-[var(--bad)] border border-[color-mix(in_srgb,var(--bad)_28%,transparent)] enabled:hover:border-[var(--bad)]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-[42px] px-3.5 text-sm',
  md: 'min-h-[44px] px-4 text-sm',
  lg: 'min-h-[48px] px-5 text-[15px]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl py-2 text-center font-semibold leading-5',
        'transition-[background-color,border-color,color,box-shadow] duration-150 [&_svg]:shrink-0',
        'disabled:cursor-not-allowed [&:disabled:not([aria-busy])]:opacity-50 aria-busy:cursor-progress aria-busy:opacity-80',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <>
          <span className="sr-only">Carregando</span>
          <span
            aria-hidden
            className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
        </>
      ) : null}
      {children}
    </button>
  );
}
