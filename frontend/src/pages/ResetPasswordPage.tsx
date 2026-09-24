import { Lock } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { supabase } from '@/lib/supabase';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [expired, setExpired] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setExpired(!data.session);
      setChecking(false);
    });
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (authError) {
      setError('Não foi possível redefinir sua senha.');
      return;
    }

    setSuccess(true);
    setTimeout(() => navigate('/login', { replace: true }), 1500);
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Validando link..." />
      </div>
    );
  }

  if (expired) {
    return (
      <AuthLayout
        title="Link expirado"
        subtitle="Solicite um novo link de recuperação de senha."
      >
        <Alert variant="warning" role="alert">
          Este link não é mais válido. Gere outro em{' '}
          <Link to="/recuperar-senha" className="text-brand-gold underline">
            recuperar senha
          </Link>
          .
        </Alert>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Nova senha"
      subtitle="Escolha uma senha forte para proteger sua conta."
    >
      {success ? (
        <Alert variant="success" title="Senha atualizada">
          Redirecionando para o login...
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? (
            <Alert variant="error" role="alert">
              {error}
            </Alert>
          ) : null}

          <Input
            label="Nova senha"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leading={<Lock className="size-4" aria-hidden />}
          />

          <Input
            label="Confirmar senha"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            leading={<Lock className="size-4" aria-hidden />}
          />

          <Button type="submit" className="w-full" loading={loading}>
            Salvar nova senha
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
