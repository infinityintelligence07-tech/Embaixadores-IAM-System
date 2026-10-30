import { Camera, LogOut, Trash2 } from 'lucide-react';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { AvatarImageError, prepareAvatar } from '@/lib/avatar-image';

type Notice = { tone: 'success' | 'error'; text: string } | null;

export function ProfilePage() {
  const { profile, refreshProfile, signOut } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState('');
  const [publicName, setPublicName] = useState('');
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState<'upload' | 'remove' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName);
      setPublicName(profile.publicName);
    }
  }, [profile]);

  useEffect(() => {
    setAvatarBroken(false);
  }, [profile?.avatarUrl]);

  if (!profile) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Carregando perfil..." />
      </div>
    );
  }

  const trimmedPublic = publicName.trim();
  const trimmedFull = fullName.trim();
  const changed = trimmedPublic !== profile.publicName || trimmedFull !== profile.fullName;
  const publicError =
    trimmedPublic.length > 0 && trimmedPublic.length < 2
      ? 'Use pelo menos 2 letras.'
      : trimmedPublic.length > 60
        ? 'Use até 60 caracteres.'
        : undefined;
  const fullError = trimmedFull.length > 0 && trimmedFull.length < 2 ? 'Use pelo menos 2 letras.' : undefined;
  const canSave = changed && trimmedPublic.length >= 2 && trimmedFull.length >= 2 && !publicError;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setNotice(null);
    try {
      await api.updateProfile({ fullName: trimmedFull, publicName: trimmedPublic });
      await refreshProfile();
      setNotice({ tone: 'success', text: 'Dados salvos. O nome novo aparece no ranking na próxima atualização.' });
    } catch (err) {
      setNotice({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Não foi possível salvar. Tente de novo.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhotoBusy('upload');
    setNotice(null);
    try {
      const image = await prepareAvatar(file);
      await api.uploadAvatar(image);
      await refreshProfile();
      setNotice({ tone: 'success', text: 'Foto atualizada.' });
    } catch (err) {
      setNotice({
        tone: 'error',
        text:
          err instanceof AvatarImageError || err instanceof Error
            ? err.message
            : 'Não foi possível enviar a foto. Tente de novo.',
      });
    } finally {
      setPhotoBusy(null);
    }
  }

  async function handleRemovePhoto() {
    setPhotoBusy('remove');
    setNotice(null);
    try {
      await api.removeAvatar();
      await refreshProfile();
      setNotice({ tone: 'success', text: 'Foto removida.' });
    } catch (err) {
      setNotice({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Não foi possível remover a foto. Tente de novo.',
      });
    } finally {
      setPhotoBusy(null);
    }
  }

  async function handleDeleteRequest() {
    setDeleting(true);
    setNotice(null);
    try {
      await api.requestAccountDeletion();
      setNotice({ tone: 'success', text: 'Pedido de exclusão enviado. A equipe entra em contato.' });
    } catch (err) {
      setNotice({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Não foi possível enviar o pedido. Tente de novo.',
      });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const status =
    profile.status === 'approved'
      ? { tone: 'success' as const, label: 'Aprovado' }
      : profile.status === 'pending'
        ? { tone: 'warning' as const, label: 'Em análise pela equipe' }
        : { tone: 'danger' as const, label: 'Suspenso' };
  const hasPhoto = Boolean(profile.avatarUrl) && !avatarBroken;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header>
        <h1 className="page-title">Perfil</h1>
        <p className="mt-2 text-text-muted">Sua foto e o nome que aparecem no ranking.</p>
      </header>

      {notice ? (
        <Alert variant={notice.tone} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </Alert>
      ) : null}

      <section className="flex flex-col items-center gap-4 rounded-[14px] border border-border bg-surface-card p-6 text-center">
        <button
          type="button"
          className="group relative size-28 rounded-full focus-visible:outline-offset-4"
          onClick={() => fileRef.current?.click()}
          disabled={photoBusy !== null}
          aria-label={hasPhoto ? 'Trocar a foto' : 'Adicionar uma foto'}
        >
          {hasPhoto ? (
            <img
              src={profile.avatarUrl ?? ''}
              alt=""
              className="size-28 rounded-full border border-border object-cover"
              onError={() => setAvatarBroken(true)}
            />
          ) : (
            <span className="flex size-28 items-center justify-center rounded-full bg-brand-violet/25 text-4xl font-semibold text-text">
              {(profile.publicName || profile.email).charAt(0).toLocaleUpperCase('pt-BR')}
            </span>
          )}
          <span className="absolute bottom-0 right-0 flex size-11 items-center justify-center rounded-full border border-border bg-surface-elevated text-text">
            {photoBusy === 'upload' ? (
              <span
                className="size-4 animate-spin rounded-full border-2 border-brand-violet border-r-transparent"
                aria-hidden
              />
            ) : (
              <Camera className="size-5" aria-hidden />
            )}
          </span>
        </button>
        <div>
          <p className="text-lg font-semibold text-text">{profile.publicName}</p>
          <p className="text-sm text-text-muted">{profile.email}</p>
          <Badge tone={status.tone} className="mt-2">
            {status.label}
          </Badge>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => void handlePhoto(event)}
        />
        <div className="flex flex-wrap justify-center gap-2.5">
          <Button
            variant="secondary"
            loading={photoBusy === 'upload'}
            disabled={photoBusy !== null}
            onClick={() => fileRef.current?.click()}
          >
            <Camera className="size-4" aria-hidden />
            {hasPhoto ? 'Trocar foto' : 'Escolher foto'}
          </Button>
          {hasPhoto ? (
            <Button
              variant="ghost"
              loading={photoBusy === 'remove'}
              disabled={photoBusy !== null}
              onClick={() => void handleRemovePhoto()}
            >
              Remover
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-text-muted">JPG, PNG ou WEBP. A foto é recortada em quadrado.</p>
      </section>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="space-y-4 rounded-[14px] border border-border bg-surface-card p-5"
      >
        <Input
          label="Nome no ranking"
          name="publicName"
          required
          maxLength={60}
          value={publicName}
          onChange={(e) => setPublicName(e.target.value)}
          error={publicError}
          hint="É o nome que todos veem na competição."
        />
        <Input
          label="Nome completo"
          name="fullName"
          required
          maxLength={120}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={fullError}
          hint="Só a equipe vê."
        />
        <Button type="submit" loading={saving} disabled={!canSave}>
          Salvar
        </Button>
      </form>

      <section className="space-y-2.5 rounded-[14px] border border-border bg-surface-card p-5">
        <Button variant="secondary" className="w-full" onClick={() => void signOut()}>
          <LogOut className="size-4" aria-hidden />
          Sair da conta
        </Button>
        <Button
          variant="ghost"
          className="w-full text-danger"
          loading={deleting}
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="size-4" aria-hidden />
          Pedir exclusão da conta
        </Button>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Pedir a exclusão da conta?"
        description="A equipe analisa o pedido e fala com você antes de apagar os dados. Suas views saem do ranking quando a exclusão terminar."
        confirmLabel="Pedir exclusão"
        busy={deleting}
        onConfirm={() => void handleDeleteRequest()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
