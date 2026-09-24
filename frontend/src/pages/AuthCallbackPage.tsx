import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { supabase } from '@/lib/supabase';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function handleCallback() {
      const { error: authError } = await supabase.auth.getSession();

      if (!active) return;

      if (authError) {
        setError('Não foi possível concluir a autenticação.');
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
        <div className="max-w-md">
          <Alert variant="error" role="alert" title="Falha na autenticação">
            {error}
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner label="Finalizando autenticação..." />
    </div>
  );
}
