import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { supabase } from '@/lib/supabase';

export function AuthCallbackPage() {
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
        setError(
          'Não foi possível concluir a entrada. Tente de novo com o Google ou entre com e-mail e senha.',
        );
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
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md space-y-4">
          <Alert variant="error" role="alert" title="Não foi possível entrar">
            {error}
          </Alert>
          <div className="flex flex-wrap gap-2.5">
            <Link
              to="/login"
              className="inline-flex min-h-[42px] items-center justify-center rounded-xl bg-brand-violet px-4 text-sm font-medium text-white"
            >
              Ir para o login
            </Link>
            <Link
              to="/recuperar-senha"
              className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-border bg-surface-card px-4 text-sm font-medium text-text"
            >
              Recuperar senha
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner label="Confirmando sua entrada..." />
    </div>
  );
}
