import { Lock } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { supabase } from '@/lib/supabase';
import { useSurfaceTheme } from '@/lib/theme';

export function ResetPasswordPage() {
  useSurfaceTheme('arena');
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [expired, setExpired] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirmPassword?: string }>(
    {},
  );
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

    const found = {
      password:
        password.length < 8
          ? 'A senha precisa ter pelo menos 8 caracteres.'
          : password.length > 72
            ? 'A senha pode ter no máximo 72 caracteres.'
            : undefined,
      confirmPassword:
        confirmPassword && confirmPassword === password
          ? undefined
          : 'As senhas não coincidem. Digite a mesma senha nos dois campos.',
    };
    setFieldErrors(found);
    if (found.password || found.confirmPassword) {
      document.getElementById(found.password ? 'password' : 'confirmPassword')?.focus();
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (authError) {
      setError(
        /at least|characters|weak|password/i.test(authError.message)
          ? 'A senha precisa ter pelo menos 8 caracteres. Escolha uma senha mais forte.'
          : 'Não foi possível redefinir sua senha. Tente de novo ou peça um novo link.',
      );
      return;
    }

    setSuccess(true);
  }

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => navigate('/rankings', { replace: true }), 1500);
    return () => clearTimeout(timer);
  }, [success, navigate]);

  if (checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface px-4">
        <Spinner label="Validando o link..." />
      </div>
    );
  }

  if (expired) {
    return (
      <AuthLayout
        title="Link expirado"
        subtitle="Por segurança, o link de recuperação vale por pouco tempo e só uma vez."
      >
        <div className="space-y-4">
          <Alert variant="warning" role="alert">
            Este link não é mais válido. Peça um novo para criar sua senha.
          </Alert>
          <Link
            to="/recuperar-senha"
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-violet px-5 text-base font-medium text-white hover:bg-brand-violet-muted"
          >
            Pedir novo link
          </Link>
          <Link
            to="/login"
            className="flex min-h-[44px] items-center justify-center text-sm font-medium text-[var(--accent-2)] underline-offset-4 hover:underline"
          >
            Voltar ao login
          </Link>
        </div>
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
          Levando você para o ranking...
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
            hint="Mínimo de 8 caracteres."
            value={password}
            error={fieldErrors.password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
            }}
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
            error={fieldErrors.confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (fieldErrors.confirmPassword) {
                setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
              }
            }}
            leading={<Lock className="size-4" aria-hidden />}
          />

          <Button type="submit" size="lg" className="min-h-12 w-full" loading={loading}>
            {loading ? 'Salvando...' : 'Salvar nova senha'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
