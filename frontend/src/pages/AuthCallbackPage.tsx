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
      const hashError = hash.get('error_description') || hash.get('error');

      const { data, error: authError } = await supabase.auth.getSession();

      if (!active) return;

      if (hashError || authError || !data.session) {
        setError(
          'O link de confirmação expirou ou já foi usado. Entre com seu e-mail e senha ou peça um novo link.',
        );
        return;
      }

      navigate('/dashboard', { replace: true });
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
