import clsx from 'clsx';
import { Link } from 'react-router-dom';

const linkClass =
  'inline-flex min-h-[44px] items-center rounded-lg px-2.5 transition-colors hover:text-text hover:underline underline-offset-4';

export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Documentos legais"
      className={clsx(
        'flex flex-wrap items-center justify-center gap-x-2 text-xs text-text-muted',
        className,
      )}
    >
      <Link to="/termos" className={linkClass}>
        Termos de uso
      </Link>
      <span aria-hidden className="opacity-60">
        •
      </span>
      <Link to="/privacidade" className={linkClass}>
        Política de privacidade
      </Link>
    </nav>
  );
}
