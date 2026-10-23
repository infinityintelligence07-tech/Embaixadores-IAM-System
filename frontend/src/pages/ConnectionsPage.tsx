import { RefreshCw, Trash2 } from 'lucide-react';
import { CompetitionGate } from '@/components/arena/CompetitionGate';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { SocialHandleDialog } from '@/components/social/SocialHandleDialog';
import {
  ApiError,
  api,
  type ConnectionStatus,
  type SocialAccount,
  type SocialPlatform,
} from '@/lib/api';
import { reviewBadge, reviewLine } from '@/lib/connection';
import {
  ABANDONED_OAUTH_HINT,
  clearOAuthStarted,
  markOAuthStarted,
  readAbandonedOAuth,
} from '@/lib/oauth-return';

function platformLabel(platform: SocialPlatform): string {
  return platform === 'instagram' ? 'Instagram' : 'TikTok';
}

function statusTone(status: ConnectionStatus): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'connected':
      return 'success';
    case 'syncing':
    case 'pending_verification':
      return 'warning';
    case 'authorization_expired':
    case 'insufficient_permission':
    case 'incompatible_account':
    case 'integration_unavailable':
      return 'danger';
    case 'disconnected':
      return 'neutral';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function statusLabel(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'Conectado';
    case 'disconnected':
      return 'Desconectado';
    case 'syncing':
      return 'Em coleta';
    case 'authorization_expired':
      return 'Autorização expirada';
    case 'insufficient_permission':
      return 'Permissão insuficiente';
    case 'incompatible_account':
      return 'Conta incompatível';
    case 'integration_unavailable':
      return 'Integração indisponível';
    case 'pending_verification':
      return 'Falta confirmar o @';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

const CALLBACK_ERRORS: Record<string, string> = {
  access_denied: 'Você cancelou a entrada. Conecte a conta para entrar na competição.',
  missing_parameters: 'A conexão foi interrompida antes de terminar. Tente de novo.',
  invalid_platform: 'Essa rede não está disponível.',
  connection_failed: 'Não foi possível concluir a entrada. Tente de novo.',
  already_connected: 'Essa conta já está conectada a outro embaixador. Use outra conta ou fale com a equipe.',
  state_expired: 'A conexão demorou demais e expirou. Comece de novo.',
  instagram_review_required: 'A Meta aceitou a permissão, mas a leitura do perfil ainda está só em teste. Uma conta comum entra depois que a análise do app for aprovada.',
  instagram_not_professional: 'Essa conta do Instagram precisa ser profissional. Troque para criador ou empresa e conecte de novo.',
};

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
        setError('Sua sessão expirou. Entre de novo para ver as conexões.');
      } else {
        setError(
          err instanceof Error ? err.message : 'Não foi possível carregar as conexões. Tente de novo.',
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

  async function handleSync(id: string) {
    setActionId(id);
    setError(null);
    try {
      await api.syncSocialAccount(id);
      await loadAccounts();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'A coleta falhou. Tente de novo em instantes.',
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
      setError(err instanceof Error ? err.message : 'Não foi possível pedir a nova análise.');
    } finally {
      setActionId(null);
    }
  }

  async function handleDisconnect(account: SocialAccount) {
    setActionId(account.id);
    setError(null);
    try {
      await api.deleteSocialAccount(account.id);
      setPendingDisconnect(null);
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

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Carregando conexões..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">Conexões</h1>
        <p className="mt-2 max-w-[62ch] text-text-muted">
          Suas redes conectadas e o estado da coleta de views.
        </p>
      </header>

      {error || visibleCallbackError ? (
        <Alert variant="error" role="alert">
          {error ?? CALLBACK_ERRORS[visibleCallbackError ?? ''] ?? 'Não foi possível concluir a conexão.'}
        </Alert>
      ) : connected || notice ? (
        <Alert variant="success" role="status">
          {notice ?? 'Conta conectada. Suas views passam a contar no ranking.'}
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
            loading={retrying}
            onClick={() => {
              setRetrying(true);
              void loadAccounts().finally(() => setRetrying(false));
            }}
          >
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

      {accounts.length === 0 ? null : (
        <ul className="space-y-3">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="rounded-[14px] border border-border bg-surface-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-text">
                      {account.username ? `@${account.username.replace(/^@/, '')}` : platformLabel(account.platform)}
                    </h3>
                    <Badge tone={statusTone(account.status)}>
                      {statusLabel(account.status)}
                    </Badge>
                    {account.status !== 'pending_verification' ? (
                      <Badge tone={reviewBadge(account.reviewStatus).tone}>
                        {reviewBadge(account.reviewStatus).label}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-text-muted">
                    {platformLabel(account.platform)}
                    {account.lastSyncAt
                      ? ` · Última coleta em ${new Intl.DateTimeFormat('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(new Date(account.lastSyncAt))}`
                      : account.status === 'connected' || account.status === 'syncing'
                        ? ' · Em coleta'
                        : ' · Sem dados'}
                  </p>
                  {account.syncMessage ? (
                    <p className="mt-2 text-sm text-text-muted" role="status">
                      {account.syncMessage}
                    </p>
                  ) : null}
                  {account.status !== 'pending_verification' &&
                  reviewLine(account.reviewStatus, account.reviewNote) ? (
                    <p className="mt-2 text-sm font-medium text-text" role="status">
                      {reviewLine(account.reviewStatus, account.reviewNote)}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  {account.status === 'pending_verification' ? (
                    <Button
                      size="sm"
                      className="min-h-[44px]"
                      onClick={() => setHandlePlatform(account.platform)}
                    >
                      Confirmar @
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="min-h-[44px]"
                      loading={actionId === account.id}
                      onClick={() => handleSync(account.id)}
                      aria-label={`Coletar agora no ${platformLabel(account.platform)}`}
                    >
                      <RefreshCw className="size-4" aria-hidden />
                      Coletar agora
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    size="sm"
                    className="min-h-[44px] min-w-[44px]"
                    disabled={actionId === account.id}
                    onClick={() => setPendingDisconnect(account)}
                    aria-label={`Desconectar ${platformLabel(account.platform)}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDisconnect !== null}
        title={`Desconectar ${pendingDisconnect ? platformLabel(pendingDisconnect.platform) : ''}?`}
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
