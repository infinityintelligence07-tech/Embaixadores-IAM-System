import { LogOut, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

export function ProfilePage() {
  const { profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [publicName, setPublicName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName);
      setPublicName(profile.publicName);
      setAvatarUrl(profile.avatarUrl ?? '');
    }
  }, [profile]);

  if (!profile) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Carregando perfil..." />
      </div>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await api.updateProfile({
        fullName,
        publicName,
        avatarUrl: avatarUrl || undefined,
      });
      await refreshProfile();
      setSuccess('Perfil atualizado com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar perfil.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  async function handleDeleteRequest() {
    if (
      !window.confirm(
        'Deseja solicitar a exclusão da sua conta? Esta ação será analisada pela equipe.',
      )
    ) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      await api.requestAccountDeletion();
      setSuccess('Solicitação de exclusão enviada. Nossa equipe entrará em contato.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a solicitação.');
    } finally {
      setDeleting(false);
    }
  }

  const statusTone =
    profile.status === 'approved'
      ? 'success'
      : profile.status === 'pending'
        ? 'warning'
        : 'danger';

  const statusLabel =
    profile.status === 'approved'
      ? 'Aprovado'
      : profile.status === 'pending'
        ? 'Pendente'
        : 'Suspenso';

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-brand-gold">Conta</p>
        <h1 className="font-display text-3xl text-text">Seu perfil</h1>
        <p className="mt-2 text-text-muted">
          Atualize seus dados e gerencie sua conta.
        </p>
      </header>

      <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface-card p-4">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="size-16 rounded-full border border-border object-cover"
          />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-full bg-brand-violet/20 text-xl font-semibold text-brand-violet">
            {(publicName || profile.email).charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <p className="font-medium text-text">{publicName}</p>
          <p className="text-sm text-text-muted">{profile.email}</p>
          <Badge tone={statusTone} className="mt-2">
            {statusLabel}
          </Badge>
        </div>
      </div>

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}
      {success ? <Alert variant="success">{success}</Alert> : null}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-border bg-surface-card p-5"
      >
        <Input
          label="Nome completo"
          name="fullName"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          hint="Usado internamente pela equipe."
        />

        <Input
          label="Nome público"
          name="publicName"
          required
          value={publicName}
          onChange={(e) => setPublicName(e.target.value)}
          hint="Exibido nos rankings e painéis públicos."
        />

        <Input
          label="URL do avatar"
          name="avatarUrl"
          type="url"
          placeholder="https://..."
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
        />

        <Button type="submit" loading={loading}>
          Salvar alterações
        </Button>
      </form>

      <section className="space-y-3 rounded-2xl border border-border bg-surface-card p-5">
        <h2 className="font-display text-lg text-text">Ações da conta</h2>
        <Button variant="secondary" className="w-full" onClick={handleLogout}>
          <LogOut className="size-4" aria-hidden />
          Sair da conta
        </Button>
        <Button
          variant="danger"
          className="w-full"
          loading={deleting}
          onClick={handleDeleteRequest}
        >
          <Trash2 className="size-4" aria-hidden />
          Solicitar exclusão da conta
        </Button>
      </section>
    </div>
  );
}
