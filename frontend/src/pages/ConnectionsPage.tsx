import { RefreshCw, Trash2 } from 'lucide-react';
import { CompetitionGate } from '@/components/arena/CompetitionGate';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import {
  ApiError,
  api,
  type ConnectionStatus,
  type SocialAccount,
  type SocialPlatform,
} from '@/lib/api';

function platformLabel(platform: SocialPlatform): string {
  return platform === 'instagram' ? 'Instagram' : 'TikTok';
}

function transportLabel(transport: SocialAccount['transport']): string {
  switch (transport) {
    case 'official_api':
      return 'API oficial';
    case 'mcp':
      return 'MCP';
    case 'demo':
      return 'Demonstração';
    default: {
      const _exhaustive: never = transport;
      return _exhaustive;
    }
  }
}

function statusTone(status: ConnectionStatus): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'connected':
      return 'success';
    case 'syncing':
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
      return 'Sincronizando';
    case 'authorization_expired':
      return 'Autorização expirada';
    case 'insufficient_permission':
      return 'Permissão insuficiente';
    case 'incompatible_account':
      return 'Conta incompatível';
    case 'integration_unavailable':
      return 'Integração indisponível';
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
  instagram_review_required: 'A Meta aceitou a permissão, mas a leitura do perfil ainda está só em teste. Uma conta comum entra depois que a análise do app for aprovada.',
  instagram_not_professional: 'Essa conta do Instagram precisa ser profissional. Troque para criador ou empresa e conecte de novo.',
};

export function ConnectionsPage() {
  const [params, setParams] = useSearchParams();
  const callbackError = params.get('error');
  const connected = params.get('connected') === 'true';
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    setError(null);
    try {
      const data = await api.socialAccounts();
      setAccounts(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Sessão expirada.');
      } else {
        setError(err instanceof Error ? err.message : 'Erro ao carregar conexões.');
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

  useEffect(() => {
    if (loading || callbackError !== 'connection_failed' || !instagramConnected) return;
    const next = new URLSearchParams(params);
    next.delete('error');
    setParams(next, { replace: true });
  }, [callbackError, instagramConnected, loading, params, setParams]);

  async function handleConnect(platform: SocialPlatform) {
    setActionId(platform);
    setError(null);
    try {
      const { url } = await api.startOAuth(platform);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível iniciar conexão.');
      setActionId(null);
    }
  }

  async function handleSync(id: string) {
    setActionId(id);
    try {
      await api.syncSocialAccount(id);
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na sincronização.');
    } finally {
      setActionId(null);
    }
  }

  async function handleDisconnect(id: string) {
    if (!window.confirm('Deseja desconectar esta conta?')) return;
    setActionId(id);
    try {
      await api.deleteSocialAccount(id);
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível desconectar.');
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
        <h1 className="font-display text-3xl text-text">Conexões</h1>
        <p className="mt-2 max-w-[62ch] text-text-muted">
          Para entrar na competição, conecte o Instagram e o TikTok com a sua conta.
          Sem essa autorização, suas views não entram no ranking.
        </p>
      </header>

      {error || visibleCallbackError ? (
        <Alert variant="error" role="alert">
          {error ?? CALLBACK_ERRORS[visibleCallbackError ?? ''] ?? 'Não foi possível concluir a conexão.'}
        </Alert>
      ) : connected ? (
        <Alert variant="success" role="status">
          Conta conectada. Suas views passam a contar no ranking.
        </Alert>
      ) : null}

      <CompetitionGate
        accounts={accounts}
        persist
        busy={actionId === 'instagram' || actionId === 'tiktok' ? actionId : null}
        onConnect={(platform) => void handleConnect(platform)}
      />

      {accounts.length === 0 ? null : (
        <ul className="space-y-3">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="rounded-2xl border border-border bg-surface-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-text">
                      @{account.username ?? 'sem usuário'}
                    </h3>
                    <Badge tone={statusTone(account.status)}>
                      {statusLabel(account.status)}
                    </Badge>
                    <Badge tone="neutral">{transportLabel(account.transport)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-text-muted">
                    {platformLabel(account.platform)}
                    {account.lastSyncAt
                      ? ` · Última sync: ${new Intl.DateTimeFormat('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(new Date(account.lastSyncAt))}`
                      : ' · Nunca sincronizado'}
                  </p>
                  {account.syncMessage ? (
                    <p className="mt-2 text-sm text-amber-200" role="status">
                      {account.syncMessage}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={actionId === account.id}
                    onClick={() => handleSync(account.id)}
                    aria-label={`Sincronizar ${account.username}`}
                  >
                    <RefreshCw className="size-4" aria-hidden />
                    Sincronizar
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    loading={actionId === account.id}
                    onClick={() => handleDisconnect(account.id)}
                    aria-label={`Desconectar ${account.username}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
