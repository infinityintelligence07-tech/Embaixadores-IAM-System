import { RefreshCw, Settings, Shield, UserCheck, UserX } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import {
  api,
  type AdminAuditEntry,
  type AdminSettings,
  type AdminSyncJob,
  type AdminUser,
  type SocialPlatform,
} from '@/lib/api';

function syncStatusTone(
  status: AdminSyncJob['status'],
): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'succeeded':
      return 'success';
    case 'failed':
      return 'danger';
    case 'running':
    case 'pending':
      return 'warning';
    case 'cancelled':
      return 'neutral';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function syncStatusLabel(status: AdminSyncJob['status']): string {
  switch (status) {
    case 'pending':
      return 'Pendente';
    case 'running':
      return 'Em execução';
    case 'succeeded':
      return 'Concluída';
    case 'failed':
      return 'Falhou';
    case 'cancelled':
      return 'Cancelada';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [syncs, setSyncs] = useState<AdminSyncJob[]>([]);
  const [audit, setAudit] = useState<AdminAuditEntry[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersData, syncsData, auditData, settingsData] = await Promise.all([
        api.adminUsers(),
        api.adminSyncs(),
        api.adminAudit(),
        api.adminSettings(),
      ]);
      setUsers(usersData);
      setSyncs(syncsData);
      setAudit(auditData);
      setSettings(settingsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar painel admin.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleApprove(id: string) {
    setActionLoading(id);
    try {
      await api.adminApproveUser(id);
      setMessage('Usuário aprovado.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aprovar.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSuspend(id: string) {
    if (!window.confirm('Suspender este usuário?')) return;
    setActionLoading(id);
    try {
      await api.adminSuspendUser(id);
      setMessage('Usuário suspenso.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao suspender.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRequestSync(userId: string, platform: SocialPlatform) {
    const key = `${userId}-${platform}`;
    setActionLoading(key);
    try {
      await api.adminRequestSync(userId, platform);
      setMessage('Sincronização solicitada.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao solicitar sync.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleExcludeContent(contentId: string, reason: string) {
    if (!contentId.trim() || !reason.trim()) return;
    setActionLoading(`exclude-${contentId}`);
    try {
      await api.adminExcludeContent(contentId.trim(), reason.trim());
      setMessage('Conteúdo excluído do ranking.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir conteúdo.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRecalculate() {
    setActionLoading('recalculate');
    try {
      await api.adminRecalculateRankings();
      setMessage('Recálculo de rankings iniciado.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no recálculo.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;

    setActionLoading('settings');
    try {
      const updated = await api.adminUpdateSettings(settings);
      setSettings(updated);
      setMessage('Configurações salvas.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar configurações.');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Carregando administração..." />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-brand-gold">
          Administração
        </p>
        <h1 className="font-display text-3xl text-text">Painel administrativo</h1>
        <p className="mt-2 text-text-muted">
          Aprove embaixadores, gerencie sincronizações e configure o programa.
        </p>
      </header>

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}
      {message ? <Alert variant="success">{message}</Alert> : null}

      <section className="rounded-2xl border border-border bg-surface-card p-5">
        <div className="flex items-center gap-2">
          <Shield className="size-5 text-brand-gold" aria-hidden />
          <h2 className="font-display text-xl text-text">Usuários</h2>
        </div>
        {users.length === 0 ? (
          <EmptyState title="Nenhum usuário" description="Lista vazia no momento." />
        ) : (
          <ul className="mt-4 space-y-3">
            {users.map((user) => (
              <li
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-elevated p-3"
              >
                <div>
                  <p className="font-medium text-text">
                    {user.publicName}{' '}
                    <span className="text-sm font-normal text-text-muted">
                      ({user.fullName})
                    </span>{' '}
                    <Badge
                      tone={
                        user.status === 'approved'
                          ? 'success'
                          : user.status === 'pending'
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {user.status}
                    </Badge>
                  </p>
                  <p className="text-sm text-text-muted">{user.email}</p>
                </div>
                <div className="flex gap-2">
                  {user.status !== 'approved' ? (
                    <Button
                      size="sm"
                      loading={actionLoading === user.id}
                      onClick={() => handleApprove(user.id)}
                    >
                      <UserCheck className="size-4" aria-hidden />
                      Aprovar
                    </Button>
                  ) : null}
                  {user.status !== 'suspended' ? (
                    <Button
                      size="sm"
                      variant="danger"
                      loading={actionLoading === user.id}
                      onClick={() => handleSuspend(user.id)}
                    >
                      <UserX className="size-4" aria-hidden />
                      Suspender
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={actionLoading === `${user.id}-instagram`}
                    onClick={() => handleRequestSync(user.id, 'instagram')}
                  >
                    Sync IG
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={actionLoading === `${user.id}-tiktok`}
                    onClick={() => handleRequestSync(user.id, 'tiktok')}
                  >
                    Sync TT
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ExcludeContentSection
        onExclude={handleExcludeContent}
        loadingId={actionLoading}
      />

      <section className="rounded-2xl border border-border bg-surface-card p-5">
        <div className="flex items-center gap-2">
          <RefreshCw className="size-5 text-brand-gold" aria-hidden />
          <h2 className="font-display text-xl text-text">Sincronizações</h2>
        </div>
        {syncs.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">Nenhuma sincronização registrada.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {syncs.map((job) => (
              <li
                key={job.id}
                className="rounded-xl border border-border bg-surface-elevated px-3 py-2 text-sm"
              >
                <span className="font-medium text-text">
                  {job.platform} · perfil {job.profileId}
                </span>
                <Badge tone={syncStatusTone(job.status)} className="ml-2">
                  {syncStatusLabel(job.status)}
                </Badge>
                {job.errorMessage ? (
                  <p className="mt-1 text-red-300">{job.errorMessage}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <Button
          className="mt-4"
          variant="secondary"
          loading={actionLoading === 'recalculate'}
          onClick={handleRecalculate}
        >
          Recalcular rankings
        </Button>
      </section>

      <section className="rounded-2xl border border-border bg-surface-card p-5">
        <div className="flex items-center gap-2">
          <Settings className="size-5 text-brand-gold" aria-hidden />
          <h2 className="font-display text-xl text-text">Configurações</h2>
        </div>
        {settings ? (
          <form onSubmit={handleSettingsSubmit} className="mt-4 space-y-4">
            <Input
              label="Intervalo de sync automático (minutos)"
              name="syncIntervalMinutes"
              type="number"
              min={1}
              value={String(settings.syncIntervalMinutes)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  syncIntervalMinutes: Number(e.target.value),
                })
              }
            />
            <Input
              label="Tolerância de dados desatualizados (horas)"
              name="staleToleranceHours"
              type="number"
              min={1}
              value={String(settings.staleToleranceHours)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  staleToleranceHours: Number(e.target.value),
                })
              }
            />
            <Input
              label="Cooldown de sync manual (segundos)"
              name="manualSyncCooldownSeconds"
              type="number"
              min={0}
              value={String(settings.manualSyncCooldownSeconds)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  manualSyncCooldownSeconds: Number(e.target.value),
                })
              }
            />
            <Button type="submit" loading={actionLoading === 'settings'}>
              Salvar configurações
            </Button>
          </form>
        ) : (
          <p className="mt-3 text-sm text-text-muted">Configurações indisponíveis.</p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface-card p-5">
        <h2 className="font-display text-xl text-text">Trilha de auditoria</h2>
        {audit.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">Nenhum evento registrado.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {audit.map((entry) => (
              <li
                key={entry.id}
                className="rounded-xl border border-border bg-surface-elevated px-3 py-2 text-sm"
              >
                <p className="font-medium text-text">{entry.action}</p>
                <p className="text-text-muted">
                  {entry.actorId ? `Ator: ${entry.actorId}` : 'Sistema'} ·{' '}
                  {entry.entityType}
                  {entry.entityId ? `: ${entry.entityId}` : ''}
                  {entry.reason ? ` · Motivo: ${entry.reason}` : ''} ·{' '}
                  {new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(entry.createdAt))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ExcludeContentSection({
  onExclude,
  loadingId,
}: {
  onExclude: (contentId: string, reason: string) => void;
  loadingId: string | null;
}) {
  const [contentId, setContentId] = useState('');
  const [reason, setReason] = useState('');

  return (
    <section className="rounded-2xl border border-border bg-surface-card p-5">
      <h2 className="font-display text-xl text-text">Excluir conteúdo</h2>
      <p className="mt-1 text-sm text-text-muted">
        Remove um conteúdo do cálculo do ranking pelo identificador, com motivo registrado.
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onExclude(contentId, reason);
        }}
      >
        <Input
          label="ID do conteúdo"
          name="contentId"
          value={contentId}
          onChange={(e) => setContentId(e.target.value)}
          placeholder="uuid-do-conteudo"
          required
        />
        <Input
          label="Motivo da exclusão"
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Descreva o motivo"
          required
        />
        <Button
          type="submit"
          variant="danger"
          loading={loadingId === `exclude-${contentId}` && Boolean(contentId)}
          disabled={!contentId.trim() || !reason.trim()}
        >
          Excluir do ranking
        </Button>
      </form>
    </section>
  );
}
