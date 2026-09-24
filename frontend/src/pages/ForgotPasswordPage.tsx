import { Mail } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { supabase } from '@/lib/supabase';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const redirectTo = `${window.location.origin}/auth/reset`;
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    setLoading(false);

    if (authError) {
      setError('Não foi possível enviar o e-mail de recuperação.');
      return;
    }

    setSuccess(true);
  }

  return (
    <AuthLayout
      title="Recuperar senha"
      subtitle="Enviaremos um link seguro para redefinir sua senha."
    >
      {success ? (
        <div className="space-y-4">
          <Alert variant="success" title="E-mail enviado">
            Se existir uma conta com esse endereço, você receberá instruções em
            instantes.
          </Alert>
          <Link
            to="/login"
            className="block text-center text-sm text-brand-gold underline-offset-4 hover:underline"
          >
            Voltar ao login
          </Link>
        </div>
      ) : (
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

          <Button type="submit" className="w-full" loading={loading}>
            Enviar link
          </Button>

          <Link
            to="/login"
            className="block text-center text-sm text-text-muted underline-offset-4 hover:underline"
          >
            Voltar ao login
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}
