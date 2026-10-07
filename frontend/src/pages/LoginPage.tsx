import { Mail, Lock } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

function loginErrorMessage(message: string): string {
  if (/not confirmed/i.test(message)) {
    return 'Confirme seu e-mail antes de entrar. Procure a mensagem de confirmação na sua caixa de entrada.';
  }
  if (/rate limit|too many/i.test(message)) {
    return 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.';
  }
  if (/network|fetch/i.test(message)) {
    return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  }
  return 'E-mail ou senha inválidos. Confira os dados e tente de novo.';
}

export function LoginPage() {
  const { state } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as { from?: string; reason?: string } | null;
  const from = routeState?.from ?? '/dashboard';
  const reason = routeState?.reason ?? null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state === 'authenticated') {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (authError) {
      setError(loginErrorMessage(authError.message));
      return;
    }

    navigate(from, { replace: true });
  }

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Use o e-mail e a senha da sua conta de embaixador."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? (
          <Alert variant="error" role="alert">
            {error}
          </Alert>
        ) : reason ? (
          <Alert variant="warning" role="status">
            {reason}
          </Alert>
        ) : null}

        <Input
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          leading={<Mail className="size-4" aria-hidden />}
        />

        <Input
          label="Senha"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          leading={<Lock className="size-4" aria-hidden />}
        />

        <div className="flex items-center justify-between text-sm">
          <Link
            to="/recuperar-senha"
            className="text-brand-violet underline-offset-4 hover:underline"
          >
            Esqueci minha senha
          </Link>
        </div>

        <Button type="submit" className="w-full" loading={loading}>
          Entrar
        </Button>

        <p className="text-center text-sm text-text-muted">
          Ainda não tem conta?{' '}
          <Link
            to="/cadastro"
            className="text-brand-violet underline-offset-4 hover:underline"
          >
            Cadastre-se
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
