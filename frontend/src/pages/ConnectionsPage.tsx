import { RefreshCw, Unlink } from 'lucide-react';
import { CompetitionGate } from '@/components/arena/CompetitionGate';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PlatformMark } from '@/components/brand/PlatformMark';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { SocialHandleDialog } from '@/components/social/SocialHandleDialog';
import {
  ApiError,
  api,
  type SocialAccount,
  type SocialPlatform,
} from '@/lib/api';
import { connectionDuty, reviewBadge, reviewLine, statusBadge } from '@/lib/connection';
import { formatDateTime, platformLabel } from '@/lib/format';
import {
  ABANDONED_OAUTH_HINT,
  clearOAuthStarted,
  markOAuthStarted,
  readAbandonedOAuth,
} from '@/lib/oauth-return';

const CALLBACK_ERRORS: Record<string, string> = {
  access_denied: 'Você cancelou a conexão. Quando quiser, toque em Conectar de novo.',
  missing_parameters: 'A conexão foi interrompida antes de terminar. Toque em Conectar de novo.',
  invalid_platform: 'Essa rede não está disponível. Conecte o Instagram ou o TikTok.',
  connection_failed: 'Não foi possível concluir a conexão. Toque em Conectar de novo.',
  already_connected: 'Essa conta já está conectada a outro embaixador. Use outra conta ou fale com a equipe.',
  state_expired: 'A conexão demorou demais e expirou. Toque em Conectar de novo.',
  instagram_review_required:
    'O Instagram ainda não liberou essa forma de conexão para a sua conta. Tente mais tarde ou fale com a equipe.',
  instagram_not_professional:
    'Essa conta do Instagram precisa ser profissional. Mude para criador ou empresa no app do Instagram e conecte de novo.',
};

function handleOf(account: SocialAccount): string | null {
  const handle = account.username?.replace(/^@/, '').trim();
  return handle ? `@${handle}` : null;
}

function syncLine(account: SocialAccount): string {
  const when = formatDateTime(account.lastSyncAt);
  if (when) return `Views atualizadas em ${when}`;
  if (account.status === 'connected' || account.status === 'syncing') return 'Em coleta';
  return 'Sem dados';
}

/** Um selo por conta: o problema da conexão, se houver; senão, a análise da equipe. */
function accountBadges(account: SocialAccount) {
  const badges: { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }[] = [];
  if (account.status !== 'connected') badges.push(statusBadge(account.status));
  if (connectionDuty(account.status) === 'ready') badges.push(reviewBadge(account.reviewStatus));
  return badges;
}

export function ConnectionsPage() {
  const [params, setParams] = useSearchParams();
  const callbackError = params.get('error');
  const connected = params.get('connected') === 'true';
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = useState<SocialAccount | null>(null);
  const [handlePlatform, setHandlePlatform] = useState<SocialPlatform | null>(null);
  const [handleSuggestion, setHandleSuggestion] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const handleOpenerRef = useRef<HTMLElement | null>(null);
  const hasCallbackResult = connected || callbackError != null;
  const [abandoned] = useState(() => (hasCallbackResult ? null : readAbandonedOAuth()));

  useEffect(() => {
    if (hasCallbackResult) clearOAuthStarted();
  }, [hasCallbackResult]);

  const loadAccounts = useCallback(async () => {
    setError(null);
    try {
      const data = await api.socialAccounts();
      setAccounts(data);
      setLoadFailed(false);
    } catch (err) {
      setLoadFailed(true);
      if (err instanceof ApiError && err.status === 401) {
        setError('Sua sessão expirou. Saia e entre de novo para ver as conexões.');
      } else {
        setError(
          err instanceof Error
            ? err.message
            : 'Não foi possível carregar as conexões. Verifique a internet e tente de novo.',
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const instagramConnected = accounts.some(
    (account) => account.platform === 'instagram' && account.status !== 'disconnected',
  );
  const visibleCallbackError =
    callbackError === 'connection_failed' && instagramConnected ? null : callbackError;
  const abandonedHint =
    abandoned &&
    !accounts.some((account) => account.platform === abandoned && account.status !== 'disconnected')
      ? ABANDONED_OAUTH_HINT[abandoned]
      : null;

  useEffect(() => {
    if (loading || callbackError !== 'connection_failed' || !instagramConnected) return;
    const next = new URLSearchParams(params);
    next.delete('error');
    setParams(next, { replace: true });
  }, [callbackError, instagramConnected, loading, params, setParams]);

  async function handleConnect(platform: SocialPlatform) {
    const active = document.activeElement;
    handleOpenerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    setActionId(platform);
    setError(null);
    setNotice(null);
    try {
      const start = await api.startOAuth(platform);
      if (start.mode === 'handle') {
        setHandleSuggestion(start.suggestedHandle);
        setHandlePlatform(platform);
        setActionId(null);
        return;
      }
      markOAuthStarted(platform);
      window.location.href = start.url;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível abrir a conexão. Tente de novo.',
      );
      setActionId(null);
    }
  }

  async function handleSync(account: SocialAccount) {
    setActionId(account.id);
    setError(null);
    setNotice(null);
    try {
      await api.syncSocialAccount(account.id);
      setNotice(
        `Pedido enviado. As views do ${platformLabel(account.platform)} aparecem atualizadas em alguns minutos.`,
      );
      await loadAccounts();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível atualizar as views. Tente de novo em instantes.',
      );
    } finally {
      setActionId(null);
    }
  }

  async function handleRequestReview(id: string) {
    setActionId(id);
    setError(null);
    setNotice(null);
    try {
      await api.requestAccountReview(id);
      setNotice('Pronto. A equipe vai olhar a conta de novo e você recebe um aviso aqui.');
      await loadAccounts();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível pedir a nova análise. Tente de novo.',
      );
    } finally {
      setActionId(null);
    }
  }

  async function handleDisconnect(account: SocialAccount) {
    setActionId(account.id);
    setError(null);
    setNotice(null);
    try {
      await api.deleteSocialAccount(account.id);
      setPendingDisconnect(null);
      setNotice(`${platformLabel(account.platform)} desconectado. Você pode conectar de novo quando quiser.`);
      await loadAccounts();
    } catch (err) {
      setPendingDisconnect(null);
      setError(
        err instanceof Error ? err.message : 'Não foi possível desconectar a conta. Tente de novo.',
      );
    } finally {
      setActionId(null);
    }
  }

  const listed = accounts.filter((account) => account.status !== 'disconnected');
  const disconnectName = pendingDisconnect
    ? handleOf(pendingDisconnect) ?? platformLabel(pendingDisconnect.platform)
    : '';

  return (
    <div className="mx-auto max-w-[640px] space-y-6">
      <header>
        <h1 className="page-title">Conexões</h1>
        <p className="mt-2 max-w-[62ch] text-text-muted">
          As redes que contam views para você no ranking.
        </p>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Carregando conexões..." />
        </div>
      ) : (
        <>
          {error || visibleCallbackError ? (
            <Alert variant="error" role="alert">
              {error ??
                CALLBACK_ERRORS[visibleCallbackError ?? ''] ??
                'Não foi possível concluir a conexão. Toque em Conectar de novo.'}
            </Alert>
          ) : connected || notice ? (
            <Alert variant="success" role="status">
              {notice ?? 'Conta conectada. As views começam a ser contadas agora.'}
            </Alert>
          ) : abandonedHint ? (
            <Alert variant="warning" role="status">
              {abandonedHint}
            </Alert>
          ) : null}

          {loadFailed && accounts.length === 0 ? (
            <div>
              <Button
                variant="secondary"
                className="min-h-[44px]"
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
            <CompetitionGate
              accounts={accounts}
              persist
              busy={actionId}
              onConnect={(platform) => void handleConnect(platform)}
              onRequestReview={(id) => void handleRequestReview(id)}
            />
          )}

          {listed.length === 0 ? null : (
            <section aria-labelledby="contas-conectadas" className="space-y-3">
              <h2 id="contas-conectadas" className="text-base font-semibold text-text">
                Suas contas
              </h2>
              <ul className="space-y-2.5">
                {listed.map((account) => {
                  const busy = actionId === account.id;
                  const handle = handleOf(account);
                  const review =
                    connectionDuty(account.status) === 'ready'
                      ? null
                      : reviewLine(account.reviewStatus, account.reviewNote);
                  return (
                    <li
                      key={account.id}
                      className="rounded-[14px] border border-border bg-surface-card p-4 sm:p-5"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 shrink-0">
                            <PlatformMark platform={account.platform} size={40} />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                              <h3 className="min-w-0 max-w-full truncate font-semibold text-text">
                                {handle ?? platformLabel(account.platform)}
                              </h3>
                              {accountBadges(account).map((badge) => (
                                <Badge key={badge.label} tone={badge.tone}>
                                  {badge.label}
                                </Badge>
                              ))}
                            </div>
                            <p className="mt-1 text-sm text-text-muted">
                              {handle ? `${platformLabel(account.platform)} · ` : ''}
                              {syncLine(account)}
                            </p>
                            {account.syncMessage ? (
                              <p className="mt-2 text-sm text-text-muted" role="status">
                                {account.syncMessage}
                              </p>
                            ) : null}
                            {review ? (
                              <p className="mt-2 text-sm font-medium text-text" role="status">
                                {review}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2.5">
                          {account.status === 'pending_verification' ? null : (
                            <Button
                              variant="secondary"
                              className="min-h-[44px] flex-1 sm:flex-none"
                              loading={busy}
                              disabled={actionId !== null}
                              onClick={() => void handleSync(account)}
                              aria-label={`Atualizar as views do ${platformLabel(account.platform)}`}
                            >
                              {busy ? null : <RefreshCw className="size-4" aria-hidden />}
                              Atualizar views
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            className="min-h-[44px] flex-1 text-[var(--bad)] sm:flex-none"
                            disabled={actionId !== null}
                            onClick={() => setPendingDisconnect(account)}
                            aria-label={`Desconectar ${platformLabel(account.platform)}`}
                          >
                            <Unlink className="size-4" aria-hidden />
                            Desconectar
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      <ConfirmDialog
        open={pendingDisconnect !== null}
        title={`Desconectar ${disconnectName}?`}
        description="As views dessa conta deixam de contar no ranking até você conectar de novo."
        confirmLabel="Desconectar"
        busy={pendingDisconnect !== null && actionId === pendingDisconnect.id}
        onConfirm={() => {
          if (pendingDisconnect) void handleDisconnect(pendingDisconnect);
        }}
        onCancel={() => setPendingDisconnect(null)}
      />

      <SocialHandleDialog
        platform={handlePlatform}
        account={accounts.find((item) => item.platform === handlePlatform) ?? null}
        suggestedHandle={handleSuggestion}
        returnFocusTo={handleOpenerRef.current}
        onClose={() => setHandlePlatform(null)}
        onChanged={(next) => {
          if (next.status !== 'pending_verification') {
            setNotice(
              next.reviewStatus === 'approved'
                ? `${platformLabel(next.platform)} conectado. A coleta começa agora e as views entram no ranking em seguida.`
                : `${platformLabel(next.platform)} conectado. A equipe vai analisar o perfil e você recebe um aviso aqui quando ele entrar no ranking.`,
            );
          }
          void loadAccounts();
        }}
      />
    </div>
  );
}
