import { Mail } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { supabase } from '@/lib/supabase';

const backLinkClass =
  'flex min-h-[44px] items-center justify-center text-sm font-medium text-[var(--accent-2)] underline-offset-4 hover:underline';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    const invalid = !cleanEmail
      ? 'Informe o e-mail da sua conta.'
      : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)
        ? undefined
        : 'Esse e-mail parece incompleto. Confira o @ e o domínio.';
    setEmailError(invalid);
    if (invalid) {
      document.getElementById('email')?.focus();
      return;
    }

    setLoading(true);
    const redirectTo = `${window.location.origin}/auth/reset`;
    const { error: authError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo,
    });

    setLoading(false);

    if (authError) {
      setError(
        /rate limit|too many/i.test(authError.message)
          ? 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.'
          : 'Não foi possível enviar o e-mail de recuperação. Confira o endereço e tente de novo.',
      );
      return;
    }

    setSuccess(true);
  }

  return (
    <AuthLayout
      title="Recuperar senha"
      subtitle="Enviaremos um link seguro para você criar uma nova senha."
    >
      {success ? (
        <div className="space-y-4">
          <Alert variant="success" title="E-mail enviado">
            Se existir uma conta com {email.trim()}, o link chega em instantes. Confira também a
            caixa de spam.
          </Alert>
          <Link to="/login" className={backLinkClass}>
            Voltar ao login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            error={emailError}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError(undefined);
            }}
            leading={<Mail className="size-4" aria-hidden />}
          />

          <Button type="submit" size="lg" className="min-h-12 w-full" loading={loading}>
            {loading ? 'Enviando...' : 'Enviar link'}
          </Button>

          <Link to="/login" className={backLinkClass}>
            Voltar ao login
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}
