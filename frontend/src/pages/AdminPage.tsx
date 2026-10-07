import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
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
  { id: 'sincronizacao', label: 'Coletas' },
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
    return `${frequency}. Ainda não há post coletado.`;
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

const AUDIT_ACTIONS: Record<string, string> = {
  approve_membership: 'Embaixador aprovado',
  suspend_membership: 'Embaixador suspenso',
  connect_social_account: 'Rede conectada',
  exclude_content: 'Conteúdo retirado do ranking',
  recalculate_rankings: 'Rankings recalculados',
  request_sync: 'Coleta solicitada',
  update_settings: 'Regras alteradas',
};

const AUDIT_ENTITIES: Record<string, string> = {
  content: 'conteúdo',
  membership: 'embaixador',
  ranking: 'ranking',
  settings: 'regras',
  social_account: 'conta social',
  profile: 'perfil',
};

function auditActionLabel(action: string): string {
  return AUDIT_ACTIONS[action] ?? action.replace(/_/g, ' ');
}

function auditEntityLabel(entry: AdminAuditEntry): string {
  const type = AUDIT_ENTITIES[entry.entityType] ?? entry.entityType;
  if (entry.entityName && entry.entityType === 'social_account') return entry.entityName;
  if (entry.entityName) return `${type} ${entry.entityName}`;
  if (entry.entityType === 'ranking' || entry.entityType === 'settings') return type;
  return entry.entityId ? `${type} ${entry.entityId.slice(0, 8)}` : type;
}

function formatWhen(value: string | null): string {
  if (!value) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}

const PAGE_SIZE = 10;

function ShowMore({
  total,
  visible,
  onMore,
}: {
  total: number;
  visible: number;
  onMore: () => void;
}) {
  if (total <= visible) return null;
  const remaining = total - visible;
  return (
    <div className="admin-row">
      <button type="button" className="admin-more" onClick={onMore}>
        Mostrar mais {Math.min(PAGE_SIZE, remaining)} de {remaining} restantes
      </button>
    </div>
  );
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
  const [visibleUsers, setVisibleUsers] = useState(PAGE_SIZE);
  const [visibleSyncs, setVisibleSyncs] = useState(PAGE_SIZE);
  const [visibleAudit, setVisibleAudit] = useState(PAGE_SIZE);
  const hasLoadedRef = useRef(false);

  const loadAll = useCallback(async () => {
    if (preview) {
      setLoading(false);
      return;
    }
    // O spinner de página inteira só aparece na primeira carga; depois a tela atualiza no lugar.
    setLoading((current) => current && !hasLoadedRef.current);
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
      syncsData.status === 'rejected' ? 'coletas' : null,
      auditData.status === 'rejected' ? 'auditoria' : null,
      settingsData.status === 'rejected' ? 'regras' : null,
    ].filter((item): item is string => item !== null);
    if (failed.length > 0) {
      setError(
        `Não foi possível carregar ${failed.join(', ')}. Atualize a página para tentar de novo.`,
      );
    }
    hasLoadedRef.current = true;
    setLoading(false);
  }, [preview]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleApprove(id: string) {
    setActionLoading(id);
    setError(null);
    setMessage(null);
    try {
      if (preview) {
        setUsers((current) =>
          current.map((user) => (user.id === id ? { ...user, status: 'approved' } : user)),
        );
      } else {
        await api.adminApproveUser(id);
        await loadAll();
      }
      setMessage('Embaixador aprovado. O acesso completo foi liberado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível aprovar. Tente de novo.');
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
      setMessage('Coleta solicitada. Os dados chegam em alguns minutos.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível pedir a coleta. Tente de novo.',
      );
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
      setMessage('Conteúdo retirado do ranking.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível retirar o conteúdo. Tente de novo.',
      );
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
        const updated = await api.adminUpdateSettings({
          staleToleranceHours: settings.staleToleranceHours,
          manualSyncCooldownSeconds: settings.manualSyncCooldownSeconds,
        });
        setSettings(updated);
        setMessage('Configurações salvas.');
        await loadAll();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível salvar as regras. Tente de novo.',
      );
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
        <h1 className="page-title">Administração</h1>
        <p className="admin-lead">
          Aprove embaixadores, acompanhe as coletas e ajuste as regras do programa.
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
              aria-pressed={section === item.id}
              onClick={() => {
                setSection(item.id);
                setMessage(null);
                setError(null);
              }}
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
              <EmptyState
                title="Nenhum embaixador cadastrado"
                description="Quando alguém criar conta ou for aprovado nas candidaturas, aparece aqui."
              />
            ) : (
              [...users]
                .sort((a, b) =>
                  peopleOrder === 'posts'
                    ? (b.postsLast30Days ?? 0) - (a.postsLast30Days ?? 0)
                    : (b.daysWithoutPosting ?? -1) - (a.daysWithoutPosting ?? -1),
                )
                .slice(0, visibleUsers)
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
                        className="admin-primary"
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
            <ShowMore
              total={users.length}
              visible={visibleUsers}
              onMore={() => setVisibleUsers((count) => count + PAGE_SIZE)}
            />
          </section>
        ) : null}

        {section === 'sincronizacao' ? (
          <section className="admin-panel" aria-label="Coletas">
            <h2>Coletas recentes</h2>
            {syncs.length === 0 ? (
              <p className="admin-row admin-meta">
                Nenhuma coleta registrada ainda. Ela começa quando um embaixador conecta uma rede.
              </p>
            ) : (
              syncs.slice(0, visibleSyncs).map((job) => (
                <article key={job.id} className="admin-row">
                  <div className="admin-person">
                    <strong>
                      {platformName(job.platform)}
                      {job.username ? ` @${job.username.replace(/^@/, '')}` : ''}
                      <span className="admin-status" data-tone={job.status === 'failed' ? 'stop' : job.status === 'succeeded' ? 'ok' : 'wait'}>
                        <i />
                        {syncStatusLabel(job.status)}
                      </span>
                    </strong>
                    <span>
                      {job.publicName ?? 'Embaixador sem nome'}
                      {job.finishedAt
                        ? ` · Terminou em ${formatWhen(job.finishedAt)}`
                        : job.startedAt
                          ? ` · Começou em ${formatWhen(job.startedAt)}`
                          : ' · Aguardando início'}
                    </span>
                    {job.errorMessage ? <span>{job.errorMessage}</span> : null}
                  </div>
                </article>
              ))
            )}
            <ShowMore
              total={syncs.length}
              visible={visibleSyncs}
              onMore={() => setVisibleSyncs((count) => count + PAGE_SIZE)}
            />
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
                  label="Coleta e ranking (minutos)"
                  name="syncIntervalMinutes"
                  type="number"
                  value={String(settings.syncIntervalMinutes)}
                  disabled
                  hint={`A cada ${settings.syncIntervalMinutes} minutos o sistema renova o acesso, lê as views e publica o ranking. Esse intervalo é definido no servidor.`}
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
                  label="Espera entre coletas manuais (segundos)"
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
              <p className="admin-row admin-meta">
                Não foi possível carregar as regras. Atualize a página para tentar de novo.
              </p>
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
              <p className="admin-row admin-meta">
                Nenhum evento registrado. Aprovações, suspensões e ajustes de regras aparecem aqui.
              </p>
            ) : (
              audit.slice(0, visibleAudit).map((entry) => (
                <article key={entry.id} className="admin-row">
                  <div className="admin-person">
                    <strong>{auditActionLabel(entry.action)}</strong>
                    <span>
                      {entry.actorName ?? (entry.actorId ? 'Administração' : 'Sistema')} ·{' '}
                      {auditEntityLabel(entry)}
                      {entry.reason ? ` · ${entry.reason}` : ''} · {formatWhen(entry.createdAt)}
                    </span>
                  </div>
                </article>
              ))
            )}
            <ShowMore
              total={audit.length}
              visible={visibleAudit}
              onMore={() => setVisibleAudit((count) => count + PAGE_SIZE)}
            />
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
