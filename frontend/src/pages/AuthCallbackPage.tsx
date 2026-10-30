import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { supabase } from '@/lib/supabase';
import { useSurfaceTheme } from '@/lib/theme';

export function AuthCallbackPage() {
  useSurfaceTheme('arena');
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function handleCallback() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const query = new URLSearchParams(window.location.search);
      const hashError =
        hash.get('error_description') ||
        hash.get('error') ||
        query.get('error_description') ||
        query.get('error');
      const cancelled = (hash.get('error') || query.get('error')) === 'access_denied';

      const { data, error: authError } = await supabase.auth.getSession();

      if (!active) return;

      if (cancelled) {
        navigate('/login', {
          replace: true,
          state: { reason: 'A entrada com o Google foi cancelada. Tente de novo quando quiser.' },
        });
        return;
      }

      if (hashError || authError || !data.session) {
        setError('Tente de novo pelo login ou entre com o e-mail e a senha da sua conta.');
        return;
      }

      navigate('/rankings', { replace: true });
    }

    void handleCallback();

    return () => {
      active = false;
    };
  }, [navigate]);

  if (error) {
    return (
      <AuthLayout title="Não foi possível entrar" subtitle="O Google não confirmou a sua entrada.">
        <div className="space-y-4">
          <Alert variant="error" role="alert">
            {error}
          </Alert>
          <Link
            to="/login"
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-violet px-5 text-base font-medium text-white hover:bg-brand-violet-muted"
          >
            Voltar ao login
          </Link>
          <Link
            to="/#formulario"
            className="flex min-h-[44px] items-center justify-center text-sm font-medium text-[var(--accent-2)] underline-offset-4 hover:underline"
          >
            Criar conta com e-mail e senha
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface px-4 text-center">
      <img src="/brand/apple-touch-icon.png" alt="" width={56} height={56} className="rounded-[14px]" />
      <Spinner label="Confirmando sua entrada..." />
    </div>
  );
}
