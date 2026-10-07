import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
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
  type UserStatus,
} from '@/lib/api';
import '@/components/admin/admin.css';

type AdminSection = 'pessoas' | 'sincronizacao' | 'regras' | 'conteudo' | 'auditoria';

export interface AdminPreview {
  users: AdminUser[];
  syncs: AdminSyncJob[];
  audit: AdminAuditEntry[];
  settings: AdminSettings;
}

const sections: { id: AdminSection; label: string }[] = [
  { id: 'pessoas', label: 'Pessoas' },
  { id: 'sincronizacao', label: 'Sincronização' },
  { id: 'regras', label: 'Regras' },
  { id: 'conteudo', label: 'Conteúdo' },
  { id: 'auditoria', label: 'Auditoria' },
];

function postingLine(user: AdminUser): string {
  const posts = user.postsLast30Days ?? 0;
  const frequency =
    posts === 0
      ? 'Nenhum post nos últimos 30 dias'
      : posts === 1
        ? '1 post nos últimos 30 dias'
        : `${posts} posts nos últimos 30 dias`;
  if (user.daysWithoutPosting == null) {
    return `${frequency}. Ainda não há post sincronizado.`;
  }
  if (user.daysWithoutPosting === 0) {
    return `${frequency}. Postou hoje.`;
  }
  if (user.daysWithoutPosting === 1) {
    return `${frequency}. Há 1 dia sem postar.`;
  }
  return `${frequency}. Há ${user.daysWithoutPosting} dias sem postar.`;
}

function statusLabel(status: UserStatus): string {
  switch (status) {
    case 'approved':
      return 'Aprovado';
    case 'pending':
      return 'Pendente';
    case 'suspended':
      return 'Suspenso';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function statusTone(status: UserStatus): 'ok' | 'wait' | 'stop' {
  switch (status) {
    case 'approved':
      return 'ok';
    case 'pending':
      return 'wait';
    case 'suspended':
      return 'stop';
    default: {
      const exhaustive: never = status;
      return exhaustive;
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
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function platformName(platform: SocialPlatform): string {
  return platform === 'instagram' ? 'Instagram' : 'TikTok';
}

export function AdminPage({ preview }: { preview?: AdminPreview }) {
  const [section, setSection] = useState<AdminSection>('pessoas');
  const [peopleOrder, setPeopleOrder] = useState<'posts' | 'silence'>('posts');
  const [users, setUsers] = useState<AdminUser[]>(preview?.users ?? []);
  const [syncs, setSyncs] = useState<AdminSyncJob[]>(preview?.syncs ?? []);
  const [audit, setAudit] = useState<AdminAuditEntry[]>(preview?.audit ?? []);
  const [settings, setSettings] = useState<AdminSettings | null>(preview?.settings ?? null);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingSuspend, setPendingSuspend] = useState<AdminUser | null>(null);

  const loadAll = useCallback(async () => {
    if (preview) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    // Cada bloco carrega por conta própria: uma falha não derruba a página inteira.
    const [usersData, syncsData, auditData, settingsData] = await Promise.allSettled([
      api.adminUsers(),
      api.adminSyncs(),
      api.adminAudit(),
      api.adminSettings(),
    ]);
    if (usersData.status === 'fulfilled') setUsers(usersData.value);
    if (syncsData.status === 'fulfilled') setSyncs(syncsData.value);
    if (auditData.status === 'fulfilled') setAudit(auditData.value);
    if (settingsData.status === 'fulfilled') setSettings(settingsData.value);

    const failed = [
      usersData.status === 'rejected' ? 'pessoas' : null,
      syncsData.status === 'rejected' ? 'sincronização' : null,
      auditData.status === 'rejected' ? 'auditoria' : null,
      settingsData.status === 'rejected' ? 'regras' : null,
    ].filter((item): item is string => item !== null);
    if (failed.length > 0) {
      setError(
        `Não foi possível carregar ${failed.join(', ')}. Atualize a página para tentar de novo.`,
      );
    }
    setLoading(false);
  }, [preview]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleApprove(id: string) {
    setActionLoading(id);
    try {
      if (preview) {
        setUsers((current) =>
          current.map((user) => (user.id === id ? { ...user, status: 'approved' } : user)),
        );
      } else {
        await api.adminApproveUser(id);
        await loadAll();
      }
      setMessage('Usuário aprovado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aprovar.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSuspend(id: string) {
    setActionLoading(id);
    setError(null);
    setMessage(null);
    try {
      if (preview) {
        setUsers((current) =>
          current.map((user) => (user.id === id ? { ...user, status: 'suspended' } : user)),
        );
      } else {
        await api.adminSuspendUser(id);
        await loadAll();
      }
      setMessage('Embaixador suspenso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível suspender. Tente de novo.');
    } finally {
      setActionLoading(null);
      setPendingSuspend(null);
    }
  }

  async function handleRequestSync(userId: string, platform: SocialPlatform) {
    const key = `${userId}-${platform}`;
    setActionLoading(key);
    try {
      if (!preview) {
        await api.adminRequestSync(userId, platform);
        await loadAll();
      }
      setMessage('Sincronização solicitada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao solicitar sincronização.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleExcludeContent(contentId: string, reason: string) {
    if (!contentId.trim() || !reason.trim()) return;
    setActionLoading(`exclude-${contentId}`);
    try {
      if (!preview) {
        await api.adminExcludeContent(contentId.trim(), reason.trim());
        await loadAll();
      }
      setMessage('Conteúdo excluído do ranking.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir conteúdo.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRecalculate() {
    setActionLoading('recalculate');
    try {
      if (!preview) {
        await api.adminRecalculateRankings();
        await loadAll();
      }
      setMessage('Recálculo de rankings iniciado.');
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
      if (preview) {
        setMessage('Configurações salvas.');
      } else {
        const updated = await api.adminUpdateSettings(settings);
        setSettings(updated);
        setMessage('Configurações salvas.');
        await loadAll();
      }
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
    <div className="admin">
      <header>
        <h1 className="admin-title">Administração</h1>
        <p className="admin-lead">
          Aprove embaixadores, acompanhe a sincronização e ajuste as regras do programa.
        </p>
      </header>

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}
      {message ? <Alert variant="success">{message}</Alert> : null}

      <div className="admin-layout">
        <nav className="admin-nav" aria-label="Seções da administração">
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={section === item.id ? 'page' : undefined}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {section === 'pessoas' ? (
          <section className="admin-panel" aria-label="Pessoas">
            <h2>Embaixadores</h2>
            <div className="admin-row">
              <div className="admin-actions">
                <button
                  type="button"
                  aria-pressed={peopleOrder === 'posts'}
                  onClick={() => setPeopleOrder('posts')}
                >
                  Quem posta mais
                </button>
                <button
                  type="button"
                  aria-pressed={peopleOrder === 'silence'}
                  onClick={() => setPeopleOrder('silence')}
                >
                  Mais tempo sem postar
                </button>
              </div>
            </div>
            {users.length === 0 ? (
              <EmptyState title="Nenhuma pessoa" description="A lista está vazia no momento." />
            ) : (
              [...users]
                .sort((a, b) =>
                  peopleOrder === 'posts'
                    ? (b.postsLast30Days ?? 0) - (a.postsLast30Days ?? 0)
                    : (b.daysWithoutPosting ?? -1) - (a.daysWithoutPosting ?? -1),
                )
                .map((user) => (
                <article key={user.id} className="admin-row">
                  <div className="admin-person">
                    <strong>
                      {user.publicName}
                      <span className="admin-status" data-tone={statusTone(user.status)}>
                        <i />
                        {statusLabel(user.status)}
                      </span>
                    </strong>
                    <span>
                      {user.fullName} · {user.email}
                    </span>
                    <span>{postingLine(user)}</span>
                  </div>
                  <div className="admin-actions">
                    {user.status !== 'approved' ? (
                      <button
                        type="button"
                        className="is-go"
                        disabled={actionLoading === user.id}
                        onClick={() => void handleApprove(user.id)}
                      >
                        Aprovar
                      </button>
                    ) : null}
                    {user.status !== 'suspended' ? (
                      <button
                        type="button"
                        className="is-stop"
                        disabled={actionLoading === user.id}
                        onClick={() => setPendingSuspend(user)}
                      >
                        Suspender
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={actionLoading === `${user.id}-instagram`}
                      onClick={() => void handleRequestSync(user.id, 'instagram')}
                    >
                      Sincronizar Instagram
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading === `${user.id}-tiktok`}
                      onClick={() => void handleRequestSync(user.id, 'tiktok')}
                    >
                      Sincronizar TikTok
                    </button>
                  </div>
                </article>
              ))
            )}
          </section>
        ) : null}

        {section === 'sincronizacao' ? (
          <section className="admin-panel" aria-label="Sincronização">
            <h2>Coletas recentes</h2>
            {syncs.length === 0 ? (
              <p className="admin-row admin-meta">Nenhuma sincronização registrada.</p>
            ) : (
              syncs.map((job) => (
                <article key={job.id} className="admin-row">
                  <div className="admin-person">
                    <strong>
                      {platformName(job.platform)}
                      <span className="admin-status" data-tone={job.status === 'failed' ? 'stop' : job.status === 'succeeded' ? 'ok' : 'wait'}>
                        <i />
                        {syncStatusLabel(job.status)}
                      </span>
                    </strong>
                    <span>Perfil {job.profileId}</span>
                    {job.errorMessage ? <span>{job.errorMessage}</span> : null}
                  </div>
                </article>
              ))
            )}
            <div className="admin-row">
              <button
                type="button"
                className="admin-primary"
                disabled={actionLoading === 'recalculate'}
                onClick={() => void handleRecalculate()}
              >
                Recalcular rankings
              </button>
            </div>
          </section>
        ) : null}

        {section === 'regras' ? (
          <section className="admin-panel" aria-label="Regras">
            <h2>Programa</h2>
            {settings ? (
              <form className="admin-form" onSubmit={(event) => void handleSettingsSubmit(event)}>
                <Input
                  label="Coleta e ranking"
                  name="syncIntervalMinutes"
                  type="number"
                  value="10"
                  disabled
                  hint="A cada 10 minutos o sistema renova o acesso, lê as views e publica o ranking."
                />
                <Input
                  label="Tolerância de dados desatualizados (horas)"
                  name="staleToleranceHours"
                  type="number"
                  min={1}
                  value={String(settings.staleToleranceHours)}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      staleToleranceHours: Number(event.target.value),
                    })
                  }
                />
                <Input
                  label="Espera para sincronizar de novo (segundos)"
                  name="manualSyncCooldownSeconds"
                  type="number"
                  min={0}
                  value={String(settings.manualSyncCooldownSeconds)}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      manualSyncCooldownSeconds: Number(event.target.value),
                    })
                  }
                />
                <Button type="submit" loading={actionLoading === 'settings'}>
                  Salvar regras
                </Button>
              </form>
            ) : (
              <p className="admin-row admin-meta">Regras indisponíveis.</p>
            )}
          </section>
        ) : null}

        {section === 'conteudo' ? (
          <ExcludeContentSection
            onExclude={handleExcludeContent}
            loadingId={actionLoading}
          />
        ) : null}

        {section === 'auditoria' ? (
          <section className="admin-panel" aria-label="Auditoria">
            <h2>Trilha</h2>
            {audit.length === 0 ? (
              <p className="admin-row admin-meta">Nenhum evento registrado.</p>
            ) : (
              audit.map((entry) => (
                <article key={entry.id} className="admin-row">
                  <div className="admin-person">
                    <strong>{entry.action}</strong>
                    <span>
                      {entry.actorId ? `Ator ${entry.actorId}` : 'Sistema'} · {entry.entityType}
                      {entry.entityId ? ` ${entry.entityId}` : ''}
                      {entry.reason ? ` · ${entry.reason}` : ''} ·{' '}
                      {new Intl.DateTimeFormat('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(entry.createdAt))}
                    </span>
                  </div>
                </article>
              ))
            )}
          </section>
        ) : null}
      </div>

      <ConfirmDialog
        open={pendingSuspend !== null}
        title={`Suspender ${pendingSuspend?.publicName ?? 'este embaixador'}?`}
        description="A pessoa perde o acesso ao painel e sai dos rankings até ser aprovada de novo."
        confirmLabel="Suspender"
        busy={pendingSuspend !== null && actionLoading === pendingSuspend.id}
        onConfirm={() => {
          if (pendingSuspend) void handleSuspend(pendingSuspend.id);
        }}
        onCancel={() => setPendingSuspend(null)}
      />
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
    <section className="admin-panel" aria-label="Conteúdo">
      <h2>Excluir do ranking</h2>
      <form
        className="admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          onExclude(contentId, reason);
        }}
      >
        <p className="admin-meta">
          Remove um conteúdo do cálculo pelo identificador, com o motivo registrado na auditoria.
        </p>
        <Input
          label="Identificador do conteúdo"
          name="contentId"
          value={contentId}
          onChange={(event) => setContentId(event.target.value)}
          placeholder="Identificador"
          required
        />
        <Input
          label="Motivo da exclusão"
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Descreva o motivo"
          required
        />
        <button
          type="submit"
          className="is-stop"
          disabled={!contentId.trim() || !reason.trim() || loadingId === `exclude-${contentId}`}
        >
          Excluir do ranking
        </button>
      </form>
    </section>
  );
}
