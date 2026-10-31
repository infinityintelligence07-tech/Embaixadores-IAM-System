import { Camera, LogOut, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlatformMark } from '@/components/brand/PlatformMark';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/contexts/AuthContext';
import {
  ApiError,
  api,
  type AccountReviewStatus,
  type DashboardAccount,
  type DashboardResponse,
  type SocialPlatform,
} from '@/lib/api';
import { AvatarImageError, prepareAvatar } from '@/lib/avatar-image';
import { formatDateTime, formatViews, platformLabel } from '@/lib/format';

type Notice = { tone: 'success' | 'error'; text: string } | null;

const PLATFORMS: SocialPlatform[] = ['instagram', 'tiktok'];

const REVIEW_BADGE: Record<
  AccountReviewStatus,
  { tone: 'success' | 'warning' | 'danger'; label: string }
> = {
  pending: { tone: 'warning', label: 'Aguardando aprovação' },
  approved: { tone: 'success', label: 'Aprovada' },
  changes_requested: { tone: 'warning', label: 'Ajuste pedido' },
  rejected: { tone: 'danger', label: 'Reprovada' },
};

function reviewBadge(status: string) {
  return REVIEW_BADGE[status as AccountReviewStatus] ?? REVIEW_BADGE.pending;
}

function accountViews(account: DashboardAccount): string {
  if (account.views === 0 && !account.lastSyncAt) return 'Em coleta';
  return account.views === 1 ? '1 view' : `${formatViews(account.views)} views`;
}

const secondaryLink =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-field-line bg-surface-card px-4 text-sm font-semibold text-text transition-colors hover:border-[var(--field-line-hover)] hover:bg-[var(--accent-soft)]';

function ViewsCard() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.dashboard());
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível carregar as suas views. Verifique a internet e tente de novo.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shell = 'space-y-4 rounded-[14px] border border-border bg-surface-card p-5';

  if (loading && !data) {
    return (
      <section aria-labelledby="views-title" className={shell}>
        <h2 id="views-title" className="text-lg font-semibold text-text">
          Suas views
        </h2>
        <div className="flex justify-center py-6">
          <Spinner label="Carregando suas views..." />
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section aria-labelledby="views-title" className={shell}>
        <h2 id="views-title" className="text-lg font-semibold text-text">
          Suas views
        </h2>
        <Alert variant="error" role="alert" title="Não foi possível carregar">
          {error ?? 'Tente de novo em instantes.'}
        </Alert>
        <Button
          variant="secondary"
          className="min-h-[44px]"
          loading={loading}
          onClick={() => void load()}
        >
          {loading ? null : <RefreshCw className="size-4" aria-hidden />}
          Tentar de novo
        </Button>
      </section>
    );
  }

  if (data.accounts.length === 0) {
    return (
      <section aria-labelledby="views-title" className={shell}>
        <div>
          <h2 id="views-title" className="text-lg font-semibold text-text">
            Suas views
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Você ainda não adicionou nenhuma conta. Adicione o seu Instagram ou TikTok e, depois
            que a equipe aprovar, as views passam a contar aqui e no ranking.
          </p>
        </div>
        <Link to="/conexoes" className={secondaryLink}>
          <Plus className="size-4" aria-hidden />
          Adicionar a primeira conta
        </Link>
      </section>
    );
  }

  const hasApproved = data.accounts.some((item) => item.reviewStatus === 'approved');
  const updated = formatDateTime(data.lastSyncAt);

  return (
    <section aria-labelledby="views-title" className={shell}>
      <div>
        <h2 id="views-title" className="text-lg font-semibold text-text">
          Suas views
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Desde o início, somando as contas aprovadas.
        </p>
      </div>

      {!hasApproved ? (
        <p className="text-sm text-text">
          Nenhuma conta aprovada ainda. Quando a equipe aprovar uma conta, as views dela somam
          aqui.
        </p>
      ) : !data.lastSyncAt ? (
        <p className="text-sm text-text">Em coleta. O total aparece depois da primeira leitura.</p>
      ) : (
        <>
          <p className="text-[32px] font-semibold leading-none tabular-nums text-text max-sm:text-[28px]">
            {formatViews(data.totalViews)}
            <span className="ml-2 text-sm font-normal text-text-muted">
              {data.totalViews === 1 ? 'view' : 'views'}
            </span>
          </p>
          <ul className="grid grid-cols-2 gap-2.5" aria-label="Views por rede">
            {PLATFORMS.map((platform) => (
              <li
                key={platform}
                className="flex items-center gap-3 rounded-xl border border-border px-3 py-3"
              >
                <PlatformMark platform={platform} size={24} />
                <span className="min-w-0">
                  <span className="block text-xs text-text-muted">{platformLabel(platform)}</span>
                  <span className="block truncate text-base font-semibold tabular-nums text-text">
                    {formatViews(data.byPlatform[platform] ?? 0)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {updated ? (
            <p className="text-xs text-text-muted">Última coleta em {updated}.</p>
          ) : null}
        </>
      )}

      <div className="space-y-2.5 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-text">Suas contas</h3>
        <ul className="space-y-2.5">
          {data.accounts.map((account) => {
            const badge = reviewBadge(account.reviewStatus);
            const handle = account.username ? `@${account.username.replace(/^@/, '')}` : 'Conta sem @';
            return (
              <li
                key={account.id}
                className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5"
              >
                <PlatformMark platform={account.platform} size={24} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-text">{handle}</span>
                  <span className="block text-xs text-text-muted">
                    {platformLabel(account.platform)} · {accountViews(account)}
                  </span>
                </span>
                <Badge tone={badge.tone}>{badge.label}</Badge>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-text-muted">
          Só as contas aprovadas somam no total e no ranking.{' '}
          <Link to="/conexoes" className="font-semibold text-text underline underline-offset-2">
            Gerenciar contas
          </Link>
        </p>
      </div>
    </section>
  );
}

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
        <p className="mt-2 text-text-muted">
          Sua foto, o nome que aparece no ranking e as views das suas contas.
        </p>
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

        <ViewsCard />

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
