import type { ReactElement } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { useAuth } from '@/contexts/AuthContext';

/** Endereço que não existe: quem está logado volta ao ranking; quem não está vê um caminho de saída. */
export function NotFoundPage() {
  const { state } = useAuth();
  if (state === 'authenticated') return <Navigate to="/rankings" replace />;
  if (state === 'loading') return null;
  return (
    <AuthLayout title="Página não encontrada" subtitle="Esse endereço não existe ou mudou de lugar.">
      <div className="grid gap-2.5">
        <Link
          to="/"
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand-violet px-4 text-sm font-medium text-white"
        >
          Ir para o início
        </Link>
        <Link
          to="/login"
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border px-4 text-sm font-medium text-text"
        >
          Entrar na minha conta
        </Link>
      </div>
    </AuthLayout>
  );
}

/** A página inicial é a porta de entrada; quem já está logado vai direto para o ranking. */
export function PublicHome({ children }: { children: ReactElement }) {
  const { state } = useAuth();
  if (state === 'authenticated') return <Navigate to="/rankings" replace />;
  return children;
}
