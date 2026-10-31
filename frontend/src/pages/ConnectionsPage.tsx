import { ExternalLink, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PlatformMark } from '@/components/brand/PlatformMark';
import { SocialHandleDialog } from '@/components/social/SocialHandleDialog';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { ApiError, api, type SocialAccount, type SocialPlatform } from '@/lib/api';
import {
  MAX_ACCOUNTS_PER_PLATFORM,
  PLATFORMS,
  activeAccounts,
  connectionDuty,
  handleOf,
  reviewBadge,
  statusBadge,
} from '@/lib/connection';
import { formatDateTime, formatViews, platformLabel, profileUrl } from '@/lib/format';

type Notice = { tone: 'success' | 'error'; text: string } | null;

function syncLine(account: SocialAccount): string {
  const when = formatDateTime(account.lastSyncAt);
  if (when) return `${formatViews(account.views)} views · última coleta em ${when}`;
  if (connectionDuty(account.status) === 'ready') return 'Em coleta. As views aparecem depois da primeira leitura.';
  return 'Sem dados';
}

function isPlatform(value: string | null): value is SocialPlatform {
  return value === 'instagram' || value === 'tiktok';
}

/** Conta inventada na hora, só para a prévia local responder aos botões. */
function previewAccount(platform: SocialPlatform, handle: string): SocialAccount {
  return {
    id: `preview-${platform}-${handle}`,
    platform,
    username: handle,
    status: 'connected',
    transport: 'demo',
    lastSyncAt: null,
    syncMessage: null,
    verificationCode: null,
    reviewStatus: 'pending',
    reviewNote: null,
    views: 0,
    createdAt: new Date().toISOString(),
  };
}

export function ConnectionsPage({ preview }: { preview?: SocialAccount[] }) {
  const [params, setParams] = useSearchParams();
  const [accounts, setAccounts] = useState<SocialAccount[]>(preview ?? []);
  const [loading, setLoading] = useState(!preview);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<SocialAccount | null>(null);
  const [addPlatform, setAddPlatform] = useState<SocialPlatform | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const loadAccounts = useCallback(async () => {
    if (preview) return;
    try {
      setAccounts(await api.socialAccounts());
      setLoadError(null);
    } catch (err) {
      setLoadError(
        err instanceof ApiError && err.status === 401
          ? 'Sua sessão expirou. Saia e entre de novo para ver as conexões.'
          : err instanceof Error
            ? err.message
            : 'Não foi possível carregar as conexões. Verifique a internet e tente de novo.',
      );
    } finally {
      setLoading(false);
    }
  }, [preview]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const listed = activeAccounts(accounts);
  const countOf = (platform: SocialPlatform) =>
    listed.filter((account) => account.platform === platform).length;

  // O ranking manda para cá com ?adicionar=instagram para abrir o diálogo direto.
  const requested = params.get('adicionar');
  useEffect(() => {
    if (loading || !isPlatform(requested)) return;
    const next = new URLSearchParams(params);
    next.delete('adicionar');
    setParams(next, { replace: true });
    if (countOf(requested) < MAX_ACCOUNTS_PER_PLATFORM) setAddPlatform(requested);
    // Só reage ao pedido vindo do endereço.
  }, [loading, requested]);

  function openAdd(platform: SocialPlatform) {
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    setNotice(null);
    setAddPlatform(platform);
  }

  function failure(err: unknown, fallback: string) {
    setNotice({ tone: 'error', text: err instanceof Error ? err.message : fallback });
  }

  async function handleSync(account: SocialAccount) {
    setActionId(account.id);
    setNotice(null);
    try {
      if (!preview) await api.syncSocialAccount(account.id);
      setNotice({
        tone: 'success',
        text: `Pedido enviado. As views de ${handleOf(account.username) ?? 'sua conta'} aparecem atualizadas em alguns minutos.`,
      });
      await loadAccounts();
    } catch (err) {
      failure(err, 'Não foi possível atualizar as views. Tente de novo em instantes.');
    } finally {
      setActionId(null);
    }
  }

  async function handleRequestReview(account: SocialAccount) {
    setActionId(account.id);
    setNotice(null);
    try {
      const next = preview
        ? { ...account, reviewStatus: 'pending' as const, reviewNote: null }
        : await api.requestAccountReview(account.id);
      setAccounts((current) => current.map((item) => (item.id === account.id ? next : item)));
      setNotice({
        tone: 'success',
        text: 'Pronto. A equipe vai olhar a conta de novo e você recebe um aviso aqui.',
      });
    } catch (err) {
      failure(err, 'Não foi possível pedir a nova análise. Tente de novo.');
    } finally {
      setActionId(null);
    }
  }

  async function handleRemove(account: SocialAccount) {
    setActionId(account.id);
    setNotice(null);
    try {
      if (!preview) await api.deleteSocialAccount(account.id);
      setAccounts((current) => current.filter((item) => item.id !== account.id));
      setNotice({
        tone: 'success',
        text: `${handleOf(account.username) ?? 'Conta'} removida. As views dela deixam de somar no ranking.`,
      });
      await loadAccounts();
    } catch (err) {
      failure(err, 'Não foi possível remover a conta. Tente de novo.');
    } finally {
      setActionId(null);
      setPendingRemove(null);
    }
  }

  function handleAdded(account: SocialAccount) {
    const known = accounts.some((item) => item.id === account.id);
    setAccounts((current) => [...current.filter((item) => item.id !== account.id), account]);
    const handle = handleOf(account.username) ?? 'A conta';
    setNotice({
      tone: 'success',
      text: known
        ? `${handle} já estava na sua lista.`
        : account.reviewStatus === 'approved'
          ? `${handle} adicionada. A coleta começa agora e as views entram no ranking em seguida.`
          : `${handle} adicionada. A equipe vai conferir o perfil e você recebe um aviso aqui quando ele entrar no ranking.`,
    });
    void loadAccounts();
  }

  return (
    <div className="mx-auto max-w-[640px] space-y-6">
      <header>
        <h1 className="page-title">Conexões</h1>
        <p className="mt-2 max-w-[62ch] text-text-muted">
          As contas do Instagram e do TikTok que somam views para você no ranking. Você pode ter
          até {MAX_ACCOUNTS_PER_PLATFORM} em cada rede, e a equipe aprova cada uma.
        </p>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Carregando conexões..." />
        </div>
      ) : loadError ? (
        <div className="space-y-4">
          <Alert variant="error" role="alert">
            {loadError}
          </Alert>
          <Button
            variant="secondary"
            loading={retrying}
            onClick={() => {
              setRetrying(true);
              void loadAccounts().finally(() => setRetrying(false));
            }}
          >
            <RefreshCw className="size-4" aria-hidden />
            Tentar de novo
          </Button>
        </div>
      ) : (
        <>
          {notice ? (
            <Alert
              variant={notice.tone}
              role={notice.tone === 'error' ? 'alert' : 'status'}
            >
              {notice.text}
            </Alert>
          ) : null}

          {PLATFORMS.map((platform) => {
            const items = listed.filter((account) => account.platform === platform);
            const full = items.length >= MAX_ACCOUNTS_PER_PLATFORM;
            const name = platformLabel(platform);
            const headingId = `contas-${platform}`;
            const limitId = `limite-${platform}`;
            return (
              <section key={platform} aria-labelledby={headingId} className="space-y-3">
                <div className="flex items-center gap-3">
                  <PlatformMark platform={platform} size={32} />
                  <h2 id={headingId} className="text-base font-semibold text-text">
                    {name}
                  </h2>
                  <span className="text-sm text-text-muted">
                    {items.length} de {MAX_ACCOUNTS_PER_PLATFORM}
                  </span>
                </div>

                {items.length === 0 ? (
                  <p className="rounded-[14px] border border-dashed border-field-line px-4 py-5 text-sm text-text-muted">
                    Nenhuma conta do {name} ainda. Adicione o @ onde você posta para as views
                    contarem.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {items.map((account) => (
                      <AccountCard
                        key={account.id}
                        account={account}
                        busy={actionId === account.id}
                        disabled={actionId !== null}
                        onSync={() => void handleSync(account)}
                        onRequestReview={() => void handleRequestReview(account)}
                        onRemove={() => setPendingRemove(account)}
                      />
                    ))}
                  </ul>
                )}

                <div className="space-y-2">
                  <button
                    type="button"
                    className="cta cta-touch w-full sm:w-auto"
                    data-blocked={full || undefined}
                    disabled={full}
                    aria-describedby={full ? limitId : undefined}
                    onClick={() => openAdd(platform)}
                  >
                    <Plus className="size-4" aria-hidden />
                    Adicionar conta do {name}
                  </button>
                  {full ? (
                    <p id={limitId} className="text-sm text-text-muted">
                      Você chegou ao limite de {MAX_ACCOUNTS_PER_PLATFORM} contas no {name}.
                      Remova uma para adicionar outra.
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </>
      )}

      <ConfirmDialog
        open={pendingRemove !== null}
        title={`Remover ${handleOf(pendingRemove?.username) ?? 'esta conta'}?`}
        description="As views dessa conta deixam de somar no ranking. Se adicionar de novo depois, a equipe confere outra vez."
        confirmLabel="Remover conta"
        busy={pendingRemove !== null && actionId === pendingRemove.id}
        onConfirm={() => {
          if (pendingRemove) void handleRemove(pendingRemove);
        }}
        onCancel={() => setPendingRemove(null)}
      />

      <SocialHandleDialog
        platform={addPlatform}
        returnFocusTo={openerRef.current}
        submitAccount={
          preview ? async (platform, handle) => previewAccount(platform, handle) : undefined
        }
        onClose={() => setAddPlatform(null)}
        onAdded={handleAdded}
      />
    </div>
  );
}

function AccountCard({
  account,
  busy,
  disabled,
  onSync,
  onRequestReview,
  onRemove,
}: {
  account: SocialAccount;
  busy: boolean;
  disabled: boolean;
  onSync: () => void;
  onRequestReview: () => void;
  onRemove: () => void;
}) {
  const handle = handleOf(account.username) ?? platformLabel(account.platform);
  const href = profileUrl(account.platform, account.username);
  const review = reviewBadge(account.reviewStatus);
  const problem = connectionDuty(account.status) === 'ready' ? null : statusBadge(account.status);

  return (
    <li className="rounded-[14px] border border-border bg-surface-card p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="-my-2 inline-flex min-h-[44px] max-w-full items-center gap-1.5 font-semibold text-text underline-offset-4 hover:underline"
              aria-label={`${handle}. Abrir o perfil no ${platformLabel(account.platform)}`}
            >
              <span className="truncate">{handle}</span>
              <ExternalLink className="size-3.5 shrink-0 text-text-muted" aria-hidden />
            </a>
          ) : (
            <p className="truncate font-semibold text-text">{handle}</p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone={review.tone}>{review.label}</Badge>
            {problem ? <Badge tone={problem.tone}>{problem.label}</Badge> : null}
          </div>
          {account.reviewStatus === 'changes_requested' ? (
            <p className="mt-2 text-sm text-text">
              <span className="font-semibold">Recado da equipe:</span>{' '}
              {account.reviewNote ?? 'Confira o perfil e avise quando ajustar.'}
            </p>
          ) : account.reviewStatus === 'rejected' ? (
            <p className="mt-2 text-sm text-text">
              <span className="font-semibold">Motivo:</span>{' '}
              {account.reviewNote ?? 'A equipe não informou o motivo. Fale com a equipe se tiver dúvida.'}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-text-muted">{syncLine(account)}</p>
          {account.syncMessage ? (
            <p className="mt-1 text-sm text-text-muted" role="status">
              {account.syncMessage}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2.5 sm:max-w-[220px] sm:justify-end">
          {account.reviewStatus === 'changes_requested' ? (
            <button
              type="button"
              className="cta cta-touch w-full"
              disabled={disabled}
              onClick={onRequestReview}
            >
              {busy ? 'Enviando...' : 'Já ajustei'}
            </button>
          ) : null}
          {account.status === 'pending_verification' ? null : (
            <Button
              variant="secondary"
              className="flex-1 sm:flex-none"
              loading={busy && account.reviewStatus !== 'changes_requested'}
              disabled={disabled}
              onClick={onSync}
              aria-label={`Atualizar as views de ${handle}`}
            >
              {busy ? null : <RefreshCw className="size-4" aria-hidden />}
              Atualizar views
            </Button>
          )}
          <Button
            variant="ghost"
            className="flex-1 text-[var(--bad)] sm:flex-none"
            disabled={disabled}
            onClick={onRemove}
            aria-label={`Remover ${handle}`}
          >
            <Trash2 className="size-4" aria-hidden />
            Remover
          </Button>
        </div>
      </div>
    </li>
  );
}
