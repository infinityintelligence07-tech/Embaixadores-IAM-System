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

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <Alert variant={notice.tone} role={notice.tone === 'error' ? 'alert' : 'status'}>
      {notice.text}
    </Alert>
  );
}

function nameError(value: string, empty: string): string | undefined {
  if (value.length === 0) return empty;
  if (value.length < 2) return 'Use pelo menos 2 letras.';
  return undefined;
}

export function ProfilePage() {
  const { profile, refreshProfile, signOut } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState('');
  const [publicName, setPublicName] = useState('');
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState<'upload' | 'remove' | null>(null);
  const [confirmRemovePhoto, setConfirmRemovePhoto] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletionSent, setDeletionSent] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [photoNotice, setPhotoNotice] = useState<Notice>(null);
  const [formNotice, setFormNotice] = useState<Notice>(null);
  const [accountNotice, setAccountNotice] = useState<Notice>(null);

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
    trimmedPublic.length > 60
      ? 'Use até 60 caracteres.'
      : nameError(trimmedPublic, 'Digite o nome que vai aparecer no ranking.');
  const fullError = nameError(trimmedFull, 'Digite o seu nome completo.');
  const canSave = changed && !publicError && !fullError;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setFormNotice(null);
    try {
      await api.updateProfile({ fullName: trimmedFull, publicName: trimmedPublic });
      await refreshProfile();
      setFormNotice({
        tone: 'success',
        text: 'Dados salvos. O nome novo aparece no ranking na próxima atualização.',
      });
    } catch (err) {
      setFormNotice({
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
    setPhotoNotice(null);
    try {
      const image = await prepareAvatar(file);
      await api.uploadAvatar(image);
      await refreshProfile();
      setPhotoNotice({ tone: 'success', text: 'Foto atualizada.' });
    } catch (err) {
      setPhotoNotice({
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
    setPhotoNotice(null);
    try {
      await api.removeAvatar();
      await refreshProfile();
      setPhotoNotice({ tone: 'success', text: 'Foto removida. No lugar dela aparece a sua inicial.' });
    } catch (err) {
      setPhotoNotice({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Não foi possível remover a foto. Tente de novo.',
      });
    } finally {
      setPhotoBusy(null);
      setConfirmRemovePhoto(false);
    }
  }

  async function handleDeleteRequest() {
    setDeleting(true);
    setAccountNotice(null);
    try {
      await api.requestAccountDeletion();
      setDeletionSent(true);
      setAccountNotice({
        tone: 'success',
        text: 'Pedido de exclusão enviado. A equipe fala com você pelo e-mail da conta.',
      });
    } catch (err) {
      setAccountNotice({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Não foi possível enviar o pedido. Tente de novo.',
      });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    setAccountNotice(null);
    try {
      await signOut();
    } catch {
      setSigningOut(false);
      setAccountNotice({
        tone: 'error',
        text: 'Não foi possível sair agora. Verifique a internet e tente de novo.',
      });
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
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="page-title">Perfil</h1>
        <p className="mt-2 text-text-muted">Sua foto e o nome que aparecem no ranking.</p>
      </header>

      <div className="space-y-2.5">
        <section
          aria-label="Foto"
          className="flex flex-col items-center gap-4 rounded-[14px] border border-border bg-surface-card px-5 py-6 text-center"
        >
          <button
            type="button"
            className="group relative size-28 rounded-full focus-visible:outline-offset-4 disabled:cursor-progress"
            onClick={() => fileRef.current?.click()}
            disabled={photoBusy !== null}
            aria-label={hasPhoto ? 'Trocar a foto' : 'Escolher uma foto'}
          >
            {hasPhoto ? (
              <img
                src={profile.avatarUrl ?? ''}
                alt=""
                className="size-28 rounded-full border border-border object-cover transition-opacity group-disabled:opacity-50"
                onError={() => setAvatarBroken(true)}
              />
            ) : (
              <span className="flex size-28 items-center justify-center rounded-full bg-brand-violet/25 text-4xl font-semibold text-text transition-opacity group-disabled:opacity-50">
                {(profile.publicName || profile.email).charAt(0).toLocaleUpperCase('pt-BR')}
              </span>
            )}
            {photoBusy ? (
              <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
                <span className="size-8 animate-spin rounded-full border-[3px] border-white border-r-transparent" />
              </span>
            ) : null}
            <span className="absolute -bottom-0.5 -right-0.5 flex size-11 items-center justify-center rounded-full border-2 border-[var(--bg)] bg-surface-elevated text-text">
              <Camera className="size-5" aria-hidden />
            </span>
          </button>
          <div className="min-w-0 max-w-full">
            <p className="truncate text-lg font-semibold text-text">{profile.publicName}</p>
            <p className="truncate text-sm text-text-muted">{profile.email}</p>
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
            aria-hidden
            onChange={(event) => void handlePhoto(event)}
          />
          <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:justify-center">
            <Button
              variant="secondary"
              className="min-h-[44px]"
              loading={photoBusy === 'upload'}
              disabled={photoBusy !== null}
              onClick={() => fileRef.current?.click()}
            >
              {photoBusy === 'upload' ? null : <Camera className="size-4" aria-hidden />}
              {photoBusy === 'upload' ? 'Enviando foto...' : hasPhoto ? 'Trocar foto' : 'Escolher foto'}
            </Button>
            {hasPhoto ? (
              <Button
                variant="ghost"
                className="min-h-[44px]"
                loading={photoBusy === 'remove'}
                disabled={photoBusy !== null}
                onClick={() => setConfirmRemovePhoto(true)}
              >
                {photoBusy === 'remove' ? 'Removendo...' : 'Remover foto'}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-text-muted">
            Foto em JPG, PNG ou WEBP, até 15 MB. Ela é cortada no centro, em formato quadrado.
          </p>
          {photoNotice ? (
            <div className="w-full text-left">
              <NoticeLine notice={photoNotice} />
            </div>
          ) : null}
        </section>

        <form
          onSubmit={handleSubmit}
          noValidate
          aria-label="Seus nomes"
          className="space-y-4 rounded-[14px] border border-border bg-surface-card p-5"
        >
          <Input
            label="Nome no ranking"
            name="publicName"
            required
            maxLength={60}
            autoComplete="nickname"
            value={publicName}
            onChange={(e) => {
              setPublicName(e.target.value);
              setFormNotice(null);
            }}
            error={publicError}
            hint="É o nome que todos veem na competição."
          />
          <Input
            label="Nome completo"
            name="fullName"
            required
            maxLength={120}
            autoComplete="name"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              setFormNotice(null);
            }}
            error={fullError}
            hint="Só a equipe vê."
          />
          <NoticeLine notice={formNotice} />
          <Button
            type="submit"
            className="min-h-[44px] w-full sm:w-auto"
            loading={saving}
            disabled={!canSave}
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </form>

        <section
          aria-label="Conta"
          className="space-y-2.5 rounded-[14px] border border-border bg-surface-card p-5"
        >
          <NoticeLine notice={accountNotice} />
          <Button
            variant="secondary"
            className="min-h-[44px] w-full"
            loading={signingOut}
            onClick={() => void handleSignOut()}
          >
            {signingOut ? null : <LogOut className="size-4" aria-hidden />}
            {signingOut ? 'Saindo...' : 'Sair da conta'}
          </Button>
          <Button
            variant="ghost"
            className="min-h-[44px] w-full text-[var(--bad)]"
            disabled={deletionSent || deleting}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" aria-hidden />
            {deletionSent ? 'Pedido de exclusão enviado' : 'Pedir exclusão da conta'}
          </Button>
        </section>
      </div>

      <ConfirmDialog
        open={confirmRemovePhoto}
        title="Remover a foto?"
        description="No lugar dela aparece a sua inicial até você escolher outra foto."
        confirmLabel="Remover foto"
        busy={photoBusy === 'remove'}
        onConfirm={() => void handleRemovePhoto()}
        onCancel={() => setConfirmRemovePhoto(false)}
      />

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
