import { Instagram, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
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

export function ConnectionsPage() {
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

  const connectedPlatforms = new Set(accounts.map((a) => a.platform));

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
        <p className="text-xs uppercase tracking-[0.2em] text-brand-gold">Redes</p>
        <h1 className="font-display text-3xl text-text">Conexões</h1>
        <p className="mt-2 text-text-muted">
          Conecte Instagram e TikTok para monitorar seus conteúdos automaticamente.
        </p>
      </header>

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {(['instagram', 'tiktok'] as SocialPlatform[]).map((platform) => (
          <article
            key={platform}
            className="rounded-2xl border border-border bg-surface-card p-5"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-brand-violet/15 p-2 text-brand-violet">
                {platform === 'instagram' ? (
                  <Instagram className="size-5" aria-hidden />
                ) : (
                  <TikTokIcon />
                )}
              </div>
              <div>
                <h2 className="font-display text-lg text-text">
                  {platformLabel(platform)}
                </h2>
                <p className="text-sm text-text-muted">
                  {connectedPlatforms.has(platform)
                    ? 'Conta vinculada'
                    : 'Nenhuma conta conectada'}
                </p>
              </div>
            </div>
            {!connectedPlatforms.has(platform) ? (
              <Button
                className="mt-4 w-full"
                loading={actionId === platform}
                onClick={() => handleConnect(platform)}
              >
                Conectar {platformLabel(platform)}
              </Button>
            ) : null}
          </article>
        ))}
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          title="Nenhuma conexão ativa"
          description="Conecte pelo menos uma rede para começar a sincronizar conteúdos."
        />
      ) : (
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
                    Sync
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

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="currentColor">
      <path d="M16.5 3c.6 3.1 2.5 5 5.5 5.3V12c-2.8-.1-5.2-1.1-7.2-2.7v7.8c0 4.2-3.4 7.6-7.6 7.6S0 21.3 0 17.1s3.4-7.6 7.6-7.6c.4 0 .8 0 1.2.1v4.3c-.3-.1-.7-.2-1.1-.2-1.8 0-3.3 1.5-3.3 3.3s1.5 3.3 3.3 3.3 3.3-1.5 3.3-3.3V3h4.5z" />
    </svg>
  );
}
