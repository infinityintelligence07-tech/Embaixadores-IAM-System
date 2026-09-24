import { Mail, Lock } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export function LoginPage() {
  const { state } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

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
      setError('E-mail ou senha inválidos. Verifique seus dados e tente novamente.');
      return;
    }

    navigate(from, { replace: true });
  }

  return (
    <AuthLayout
      title="Acorde Sua Mente"
      subtitle="Entre para acompanhar seu desempenho como embaixador."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? (
          <Alert variant="error" role="alert">
            {error}
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
            className="text-brand-gold underline-offset-4 hover:underline"
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
            className="text-brand-gold underline-offset-4 hover:underline"
          >
            Cadastre-se
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
