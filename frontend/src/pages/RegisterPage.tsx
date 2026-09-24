import { Mail, Lock, UserRound } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export function RegisterPage() {
  const { state } = useAuth();
  const [fullName, setFullName] = useState('');
  const [publicName, setPublicName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (state === 'authenticated') {
    return <Navigate to="/onboarding" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          public_name: publicName,
        },
      },
    });

    setLoading(false);

    if (authError) {
      setError(authError.message || 'Não foi possível criar sua conta.');
      return;
    }

    setSuccess(true);
  }

  return (
    <AuthLayout
      title="Criar conta"
      subtitle="Junte-se ao programa de embaixadores digitais."
    >
      {success ? (
        <Alert variant="success" title="Conta criada">
          Verifique seu e-mail para confirmar o cadastro. Depois, faça login e
          complete seu perfil.
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? (
            <Alert variant="error" role="alert">
              {error}
            </Alert>
          ) : null}

          <Input
            label="Nome completo"
            name="fullName"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            leading={<UserRound className="size-4" aria-hidden />}
          />

          <Input
            label="Nome público"
            name="publicName"
            required
            value={publicName}
            onChange={(e) => setPublicName(e.target.value)}
            hint="Será exibido nos rankings."
            leading={<UserRound className="size-4" aria-hidden />}
          />

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
            autoComplete="new-password"
            required
            minLength={8}
            hint="Mínimo de 8 caracteres."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leading={<Lock className="size-4" aria-hidden />}
          />

          <Button type="submit" className="w-full" loading={loading}>
            Cadastrar
          </Button>

          <p className="text-center text-sm text-text-muted">
            Já tem conta?{' '}
            <Link
              to="/login"
              className="text-brand-gold underline-offset-4 hover:underline"
            >
              Entrar
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
