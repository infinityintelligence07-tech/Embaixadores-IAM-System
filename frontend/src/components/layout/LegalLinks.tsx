import clsx from 'clsx';
import { Link } from 'react-router-dom';

export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Documentos legais"
      className={clsx('flex items-center justify-center gap-4 text-xs text-text-muted', className)}
    >
      <Link to="/termos" className="inline-flex min-h-[44px] items-center px-2 hover:text-brand-violet hover:underline underline-offset-4">
        Termos de uso
      </Link>
      <span aria-hidden>•</span>
      <Link to="/privacidade" className="inline-flex min-h-[44px] items-center px-2 hover:text-brand-violet hover:underline underline-offset-4">
        Política de privacidade
      </Link>
    </nav>
  );
}
