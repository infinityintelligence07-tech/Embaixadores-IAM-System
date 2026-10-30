import { Mail, Lock } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { GoogleEntry } from '@/components/auth/GoogleButton';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const linkClass =
  'inline-flex min-h-[44px] items-center font-medium text-[var(--accent-2)] underline-offset-4 hover:underline';

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
  const from = routeState?.from ?? '/rankings';
  const reason = routeState?.reason ?? null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  if (state === 'authenticated') {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    const found = {
      email: !cleanEmail
        ? 'Informe seu e-mail.'
        : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)
          ? undefined
          : 'Esse e-mail parece incompleto. Confira o @ e o domínio.',
      password: password ? undefined : 'Informe sua senha.',
    };
    setFieldErrors(found);
    if (found.email || found.password) {
      document.getElementById(found.email ? 'email' : 'password')?.focus();
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    setLoading(false);

    if (authError) {
      setError(loginErrorMessage(authError.message));
      const passwordField = document.getElementById('password') as HTMLInputElement | null;
      passwordField?.focus();
      passwordField?.select();
      return;
    }

    navigate(from, { replace: true });
  }

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Entre com a sua conta de embaixador."
    >
      <GoogleEntry className="mb-5 grid gap-4" />
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          error={fieldErrors.email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
          }}
          leading={<Mail className="size-4" aria-hidden />}
        />

        <Input
          label="Senha"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          error={fieldErrors.password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
          }}
          leading={<Lock className="size-4" aria-hidden />}
        />

        <div className="-mt-1 flex text-sm">
          <Link to="/recuperar-senha" className={linkClass}>
            Esqueci minha senha
          </Link>
        </div>

        <Button type="submit" size="lg" className="min-h-12 w-full" loading={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </Button>

        <p className="text-center text-sm text-text-muted">
          Ainda não tem conta?{' '}
          <Link to="/#formulario" className={linkClass}>
            Cadastre-se
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
