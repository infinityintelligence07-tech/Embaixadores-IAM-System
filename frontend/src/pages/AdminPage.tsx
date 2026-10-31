import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminBoard } from '@/components/admin/AdminBoard';
import { CampaignsSection } from '@/components/admin/CampaignsSection';
import { ListFooter, useListWindow } from '@/components/admin/ListWindow';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
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

type AdminSection =
  | 'novos'
  | 'pessoas'
  | 'rankings'
  | 'sincronizacao'
  | 'regras'
  | 'conteudo'
  | 'auditoria';

export interface AdminPreview {
  users: AdminUser[];
  syncs: AdminSyncJob[];
  audit: AdminAuditEntry[];
  settings: AdminSettings;
}

const sections: { id: AdminSection; label: string }[] = [
  { id: 'novos', label: 'Aprovações' },
  { id: 'pessoas', label: 'Pessoas' },
  { id: 'rankings', label: 'Rankings' },
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
      return 'Aguardando';
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
      return 'Na fila';
    case 'running':
      return 'Em andamento';
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

// Cancelada é um estado final neutro, não uma espera
function jobTone(status: AdminSyncJob['status']): 'ok' | 'wait' | 'stop' | undefined {
  switch (status) {
    case 'succeeded':
      return 'ok';
    case 'failed':
      return 'stop';
    case 'cancelled':
      return undefined;
    default:
      return 'wait';
  }
}

function platformName(platform: SocialPlatform): string {
  return platform === 'instagram' ? 'Instagram' : 'TikTok';
}

const AUDIT_ACTIONS: Record<string, string> = {
  approve_application: 'Cadastro aprovado',
  reject_application: 'Cadastro reprovado',
  approve_membership: 'Embaixador aprovado',
  review_account_approved: 'Conta aprovada no ranking',
  review_account_changes_requested: 'Ajuste pedido na conta',
  review_account_rejected: 'Conta reprovada',
  request_account_review: 'Embaixador pediu nova análise',
  create_campaign: 'Campanha criada',
  delete_campaign: 'Campanha apagada',
  update_ranking_mode: 'Modo do ranking alterado',
  suspend_membership: 'Embaixador suspenso',
  connect_social_account: 'Rede conectada',
  claim_social_handle: '@ da rede informado',
  verify_social_handle: 'Rede confirmada',
  exclude_content: 'Vídeo retirado do ranking',
  recalculate_rankings: 'Rankings recalculados',
  request_sync: 'Coleta solicitada',
  update_settings: 'Regras alteradas',
};

const AUDIT_ENTITIES: Record<string, string> = {
  application: 'cadastro de',
  campaign: 'campanha',
  content: 'vídeo',
  membership: 'embaixador',
  ranking: 'ranking',
  settings: 'regras',
  social_account: 'conta',
  profile: 'perfil',
};

function auditActionLabel(action: string): string {
  const known = AUDIT_ACTIONS[action];
  if (known) return known;
  const text = action.replace(/_/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function auditEntityLabel(entry: AdminAuditEntry): string {
  const type = AUDIT_ENTITIES[entry.entityType] ?? entry.entityType.replace(/_/g, ' ');
  if (entry.entityName && entry.entityType === 'social_account') return entry.entityName;
  if (entry.entityName) return `${type} ${entry.entityName}`;
  return type.replace(/ de$/, '');
}

function formatWhen(value: string | null): string {
  if (!value) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}

const CONTENT_CODE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Acha o código do vídeo no que a equipe colar: o código sozinho, uma mensagem ou um link. */
function findContentCode(value: string): string | null {
  return value.match(CONTENT_CODE)?.[0].toLowerCase() ?? null;
}

export function AdminPage({ preview }: { preview?: AdminPreview }) {
  const [searchParams] = useSearchParams();
  const [section, setSection] = useState<AdminSection>(() => {
    const requested = searchParams.get('secao');
    return sections.some((item) => item.id === requested) ? (requested as AdminSection) : 'novos';
  });
  const [peopleOrder, setPeopleOrder] = useState<'posts' | 'silence'>('posts');
  const [users, setUsers] = useState<AdminUser[]>(preview?.users ?? []);
  const [syncs, setSyncs] = useState<AdminSyncJob[]>(preview?.syncs ?? []);
  const [audit, setAudit] = useState<AdminAuditEntry[]>(preview?.audit ?? []);
  const [settings, setSettings] = useState<AdminSettings | null>(preview?.settings ?? null);
  const [savedSettings, setSavedSettings] = useState<AdminSettings | null>(
    preview?.settings ?? null,
  );
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingSuspend, setPendingSuspend] = useState<AdminUser | null>(null);
  const [waitingCount, setWaitingCount] = useState(0);
  const hasLoadedRef = useRef(false);

  const usersList = useListWindow(users.length);
  const syncsList = useListWindow(syncs.length);
  const auditList = useListWindow(audit.length);

  const showMessage = useCallback((text: string) => {
    setError(null);
    setMessage(text);
  }, []);
  const showError = useCallback((text: string) => {
    setMessage(null);
    setError(text);
  }, []);

  const loadAll = useCallback(async () => {
    if (preview) {
      setLoading(false);
      return;
    }
    // O spinner de página inteira só aparece na primeira carga; depois a tela atualiza no lugar.
    setLoading((current) => current && !hasLoadedRef.current);
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
    if (settingsData.status === 'fulfilled') {
      setSettings(settingsData.value);
      setSavedSettings(settingsData.value);
    }

    const failed = [
      usersData.status === 'rejected' ? 'pessoas' : null,
      syncsData.status === 'rejected' ? 'coletas' : null,
      auditData.status === 'rejected' ? 'auditoria' : null,
      settingsData.status === 'rejected' ? 'regras' : null,
    ].filter((item): item is string => item !== null);
    if (failed.length > 0) {
      setMessage(null);
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
      setMessage(
        'Embaixador aprovado. O acesso completo foi liberado e as contas informadas entram no ranking.',
      );
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
      setMessage('Embaixador suspenso. Ele saiu dos rankings e perdeu o acesso ao painel.');
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
    setError(null);
    setMessage(null);
    try {
      if (!preview) {
        await api.adminRequestSync(userId, platform);
        await loadAll();
      }
      setMessage(`Coleta do ${platformName(platform)} pedida. Os dados chegam em alguns minutos.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível pedir a coleta. Tente de novo.',
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleExcludeContent(contentId: string, reason: string): Promise<boolean> {
    if (!contentId.trim() || !reason.trim()) return false;
    setActionLoading(`exclude-${contentId}`);
    setError(null);
    setMessage(null);
    try {
      if (!preview) {
        await api.adminExcludeContent(contentId.trim(), reason.trim());
        await loadAll();
      }
      setMessage(
        'Vídeo retirado do ranking. As views dele deixam de contar na próxima atualização.',
      );
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível retirar o vídeo. Tente de novo.',
      );
      return false;
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRecalculate() {
    setActionLoading('recalculate');
    setError(null);
    setMessage(null);
    try {
      if (!preview) {
        await api.adminRecalculateRankings();
        await loadAll();
      }
      setMessage('Recálculo dos rankings iniciado. Os números novos aparecem em alguns minutos.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível recalcular. Tente de novo.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setActionLoading('settings');
    setError(null);
    setMessage(null);
    try {
      if (preview) {
        setSavedSettings(settings);
      } else {
        const updated = await api.adminUpdateSettings({
          staleToleranceHours: settings.staleToleranceHours,
          manualSyncCooldownSeconds: settings.manualSyncCooldownSeconds,
        });
        setSettings(updated);
        setSavedSettings(updated);
        await loadAll();
      }
      setMessage('Regras salvas. Valem a partir da próxima atualização do ranking.');
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

  const settingsChanged =
    settings !== null &&
    savedSettings !== null &&
    (settings.staleToleranceHours !== savedSettings.staleToleranceHours ||
      settings.manualSyncCooldownSeconds !== savedSettings.manualSyncCooldownSeconds);
  const settingsValid =
    settings !== null &&
    Number.isFinite(settings.staleToleranceHours) &&
    settings.staleToleranceHours >= 1 &&
    Number.isFinite(settings.manualSyncCooldownSeconds) &&
    settings.manualSyncCooldownSeconds >= 0;

  const sortedUsers = [...users].sort((a, b) =>
    peopleOrder === 'posts'
      ? (b.postsLast30Days ?? 0) - (a.postsLast30Days ?? 0)
      : (b.daysWithoutPosting ?? -1) - (a.daysWithoutPosting ?? -1),
  );

  return (
    <div className="admin">
      <header>
        <h1 className="page-title">Administração</h1>
        <p className="admin-lead">
          Aprove novos membros, acompanhe as coletas e ajuste as regras do programa.
        </p>
      </header>

      {error || message ? (
        <div className="admin-feedback">
          {error ? (
            <Alert variant="error" role="alert">
              <span className="admin-feedback-body">
                <span>{error}</span>
                <button
                  type="button"
                  className="admin-feedback-close"
                  onClick={() => setError(null)}
                >
                  Fechar
                </button>
              </span>
            </Alert>
          ) : null}
          {message ? (
            <Alert variant="success">
              <span className="admin-feedback-body">
                <span>{message}</span>
                <button
                  type="button"
                  className="admin-feedback-close"
                  onClick={() => setMessage(null)}
                >
                  Fechar
                </button>
              </span>
            </Alert>
          ) : null}
        </div>
      ) : null}

      <div className={section === 'novos' ? 'admin-layout is-wide' : 'admin-layout'}>
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
              {item.id === 'novos' && waitingCount > 0 ? (
                <span
                  className="admin-nav-count"
                  aria-label={`${waitingCount} aguardando`}
                >
                  {waitingCount}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        {section === 'novos' ? (
          <AdminBoard
            users={users}
            preview={preview != null}
            onChanged={loadAll}
            onWaitingCount={setWaitingCount}
            onMessage={showMessage}
            onError={showError}
          />
        ) : null}

        {section === 'rankings' ? (
          <CampaignsSection
            preview={preview != null}
            onMessage={showMessage}
            onError={showError}
          />
        ) : null}

        {section === 'pessoas' ? (
          <section className="admin-panel" aria-labelledby="people-title">
            <div className="admin-panel-head">
              <h2 id="people-title">Embaixadores</h2>
              <p>
                Todas as pessoas com conta no programa. Contas da equipe aparecem aqui, mas não
                entram no ranking.
              </p>
            </div>
            {users.length > 0 ? (
              <div className="admin-toolbar">
                <span className="admin-toolbar-label" id="people-order">
                  Ordenar por
                </span>
                <div className="admin-segment" role="group" aria-labelledby="people-order">
                  <button
                    type="button"
                    aria-pressed={peopleOrder === 'posts'}
                    onClick={() => {
                      setPeopleOrder('posts');
                      usersList.reset();
                    }}
                  >
                    Mais posts
                  </button>
                  <button
                    type="button"
                    aria-pressed={peopleOrder === 'silence'}
                    onClick={() => {
                      setPeopleOrder('silence');
                      usersList.reset();
                    }}
                  >
                    Mais dias sem postar
                  </button>
                </div>
              </div>
            ) : null}
            {users.length === 0 ? (
              <div className="admin-empty" role="status">
                <strong>Nenhum embaixador cadastrado</strong>
                <p>
                  Quando alguém se cadastrar no site, a pessoa aparece em Aprovações para
                  aprovar e depois aqui.
                </p>
              </div>
            ) : (
              sortedUsers.slice(usersList.start, usersList.end).map((user) => {
                const team = user.role === 'admin';
                const busy = actionLoading === user.id;
                return (
                  <article key={user.id} className="admin-row">
                    <div className="admin-person">
                      <strong>
                        {user.publicName}
                        <span className="admin-status" data-tone={statusTone(user.status)}>
                          <i />
                          {statusLabel(user.status)}
                        </span>
                        {team ? (
                          <span className="admin-status">
                            <i />
                            Equipe, fora do ranking
                          </span>
                        ) : null}
                      </strong>
                      <span>
                        {user.fullName} · {user.email}
                      </span>
                      <span>{postingLine(user)}</span>
                    </div>
                    <div className="admin-actions">
                      <button
                        type="button"
                        disabled={actionLoading === `${user.id}-instagram`}
                        onClick={() => void handleRequestSync(user.id, 'instagram')}
                      >
                        {actionLoading === `${user.id}-instagram`
                          ? 'Pedindo...'
                          : 'Coletar Instagram'}
                      </button>
                      <button
                        type="button"
                        disabled={actionLoading === `${user.id}-tiktok`}
                        onClick={() => void handleRequestSync(user.id, 'tiktok')}
                      >
                        {actionLoading === `${user.id}-tiktok` ? 'Pedindo...' : 'Coletar TikTok'}
                      </button>
                      {user.status !== 'suspended' ? (
                        <button
                          type="button"
                          className="is-stop"
                          disabled={busy}
                          onClick={() => setPendingSuspend(user)}
                        >
                          Suspender
                        </button>
                      ) : null}
                      {user.status !== 'approved' ? (
                        <button
                          type="button"
                          className="admin-primary"
                          disabled={busy}
                          onClick={() => void handleApprove(user.id)}
                        >
                          {busy ? 'Salvando...' : user.status === 'suspended' ? 'Reativar' : 'Aprovar'}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
            <ListFooter list={usersList} label="embaixadores" />
          </section>
        ) : null}

        {section === 'sincronizacao' ? (
          <section className="admin-panel" aria-labelledby="syncs-title">
            <div className="admin-panel-head">
              <h2 id="syncs-title">Coletas</h2>
              <p>
                Cada coleta lê as views de uma conta.
                {settings
                  ? ` O ranking se atualiza sozinho a cada ${settings.syncIntervalMinutes} minutos.`
                  : ''}
              </p>
            </div>
            <div className="admin-row">
              <div className="admin-person">
                <strong>Recalcular os rankings agora</strong>
                <span>
                  Use depois de retirar um vídeo ou aprovar contas, para não esperar a próxima
                  atualização.
                </span>
              </div>
              <div className="admin-actions">
                <button
                  type="button"
                  disabled={actionLoading === 'recalculate'}
                  onClick={() => void handleRecalculate()}
                >
                  {actionLoading === 'recalculate' ? 'Recalculando...' : 'Recalcular rankings'}
                </button>
              </div>
            </div>
            <h3 className="admin-subhead">
              Coletas recentes{syncs.length > 0 ? <span>{syncs.length}</span> : null}
            </h3>
            {syncs.length === 0 ? (
              <div className="admin-empty" role="status">
                <strong>Nenhuma coleta registrada ainda</strong>
                <p>
                  As coletas começam sozinhas quando há contas aprovadas. Para pedir uma agora, vá
                  em Pessoas e toque em Coletar.
                </p>
              </div>
            ) : (
              syncs.slice(syncsList.start, syncsList.end).map((job) => (
                <article key={job.id} className="admin-row">
                  <div className="admin-person">
                    <strong>
                      {job.publicName ?? 'Nome não informado'}
                      <span className="admin-status" data-tone={jobTone(job.status)}>
                        <i />
                        {syncStatusLabel(job.status)}
                      </span>
                    </strong>
                    <span>
                      {platformName(job.platform)}
                      {job.username ? ` @${job.username.replace(/^@/, '')}` : ''}
                      {job.finishedAt
                        ? ` · Terminou em ${formatWhen(job.finishedAt)}`
                        : job.startedAt
                          ? ` · Começou em ${formatWhen(job.startedAt)}`
                          : ' · Aguardando início'}
                    </span>
                    {job.errorMessage ? (
                      <span className="admin-note admin-note-bad">
                        Motivo: {job.errorMessage}
                      </span>
                    ) : null}
                  </div>
                </article>
              ))
            )}
            <ListFooter list={syncsList} label="coletas" />
          </section>
        ) : null}

        {section === 'regras' ? (
          <section className="admin-panel" aria-labelledby="rules-title">
            <div className="admin-panel-head">
              <h2 id="rules-title">Regras do programa</h2>
              <p>Valem para todos os embaixadores a partir da próxima atualização do ranking.</p>
            </div>
            {settings ? (
              <>
                <div className="admin-row">
                  <div className="admin-person">
                    <strong>Coleta e ranking a cada {settings.syncIntervalMinutes} minutos</strong>
                    <span>
                      Nesse intervalo o sistema lê as views e publica o ranking. Ele é definido no
                      servidor e não muda por aqui.
                    </span>
                  </div>
                </div>
                <form
                  className="admin-form"
                  onSubmit={(event) => void handleSettingsSubmit(event)}
                >
                  <Input
                    label="Tempo máximo sem coleta (horas)"
                    name="staleToleranceHours"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    required
                    value={
                      Number.isFinite(settings.staleToleranceHours)
                        ? String(settings.staleToleranceHours)
                        : ''
                    }
                    hint="Se a conta passar esse tempo sem uma coleta nova, ela sai do ranking até a próxima coleta dar certo."
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        staleToleranceHours:
                          event.target.value === '' ? Number.NaN : Number(event.target.value),
                      })
                    }
                  />
                  <Input
                    label="Espera entre coletas pedidas à mão (segundos)"
                    name="manualSyncCooldownSeconds"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    required
                    value={
                      Number.isFinite(settings.manualSyncCooldownSeconds)
                        ? String(settings.manualSyncCooldownSeconds)
                        : ''
                    }
                    hint="Tempo mínimo entre dois pedidos de coleta para a mesma conta. Evita bloqueio pelas redes."
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        manualSyncCooldownSeconds:
                          event.target.value === '' ? Number.NaN : Number(event.target.value),
                      })
                    }
                  />
                  <div className="admin-form-actions">
                    <Button
                      type="submit"
                      loading={actionLoading === 'settings'}
                      disabled={!settingsChanged || !settingsValid}
                    >
                      Salvar regras
                    </Button>
                    {settingsChanged ? (
                      <Button
                        variant="secondary"
                        disabled={actionLoading === 'settings'}
                        onClick={() => setSettings(savedSettings)}
                      >
                        Desfazer
                      </Button>
                    ) : (
                      <span className="admin-meta">Nenhuma mudança para salvar.</span>
                    )}
                  </div>
                </form>
              </>
            ) : (
              <div className="admin-empty" role="alert">
                <strong>Não foi possível carregar as regras</strong>
                <p>Confira a internet e tente de novo. Se continuar, avise o suporte técnico.</p>
                <div className="admin-actions">
                  <button type="button" onClick={() => void loadAll()}>
                    Tentar de novo
                  </button>
                </div>
              </div>
            )}
          </section>
        ) : null}

        {section === 'conteudo' ? (
          <ExcludeContentSection onExclude={handleExcludeContent} loadingId={actionLoading} />
        ) : null}

        {section === 'auditoria' ? (
          <section className="admin-panel" aria-labelledby="audit-title">
            <div className="admin-panel-head">
              <h2 id="audit-title">Histórico de ações</h2>
              <p>
                Aprovações, reprovações, suspensões e mudanças de regras ficam registradas aqui,
                com quem fez e quando.
              </p>
            </div>
            {audit.length === 0 ? (
              <div className="admin-empty" role="status">
                <strong>Nenhuma ação registrada</strong>
                <p>A primeira aprovação ou mudança de regra já aparece aqui.</p>
              </div>
            ) : (
              audit.slice(auditList.start, auditList.end).map((entry) => (
                <article key={entry.id} className="admin-row">
                  <div className="admin-person">
                    <strong>{auditActionLabel(entry.action)}</strong>
                    <span>
                      {entry.actorName ?? (entry.actorId ? 'Equipe' : 'Sistema')} ·{' '}
                      {auditEntityLabel(entry)} · {formatWhen(entry.createdAt)}
                    </span>
                    {entry.reason ? (
                      <span className="admin-note">Motivo: {entry.reason}</span>
                    ) : null}
                  </div>
                </article>
              ))
            )}
            <ListFooter list={auditList} label="histórico" />
          </section>
        ) : null}
      </div>

      <ConfirmDialog
        open={pendingSuspend !== null}
        title={`Suspender ${pendingSuspend?.publicName ?? 'este embaixador'}?`}
        description="A pessoa perde o acesso ao painel e sai dos rankings até ser reativada."
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
  onExclude: (contentId: string, reason: string) => Promise<boolean>;
  loadingId: string | null;
}) {
  const [codeInput, setCodeInput] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const code = findContentCode(codeInput);
  const codeError =
    touched && codeInput.trim() !== '' && !code
      ? 'Não achamos um código de vídeo nesse texto. Ele tem 36 caracteres, letras e números separados por hífens.'
      : undefined;
  const busy = code !== null && loadingId === `exclude-${code}`;
  const ready = code !== null && reason.trim().length >= 3;

  return (
    <section className="admin-panel" aria-labelledby="exclude-title">
      <div className="admin-panel-head">
        <h2 id="exclude-title">Retirar vídeo do ranking</h2>
        <p>
          Use quando um vídeo não segue as regras do programa. As views dele deixam de contar, o
          vídeo continua guardado e o motivo fica no histórico.
        </p>
      </div>
      <form
        className="admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          setTouched(true);
          if (ready) setConfirming(true);
        }}
      >
        <Input
          label="Código do vídeo"
          name="contentId"
          autoComplete="off"
          spellCheck={false}
          value={codeInput}
          onChange={(event) => setCodeInput(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="Cole o código aqui"
          error={codeError}
          hint={
            code && code !== codeInput.trim().toLowerCase()
              ? `Código encontrado: ${code}`
              : 'Peça o código ao suporte técnico. Pode colar a mensagem inteira, o código é reconhecido sozinho.'
          }
          required
        />
        <Input
          label="Motivo"
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Ex.: o vídeo não é do programa"
          hint="Fica registrado no histórico de ações."
          required
        />
        <div className="admin-form-actions">
          <button type="submit" className="is-stop" disabled={!ready || busy}>
            {busy ? 'Retirando...' : 'Retirar do ranking'}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={confirming}
        title="Retirar este vídeo do ranking?"
        description={`As views do vídeo deixam de contar para todos os rankings. Motivo: ${reason.trim()}`}
        confirmLabel="Retirar do ranking"
        busy={busy}
        onConfirm={() => {
          if (!code) return;
          void onExclude(code, reason).then((done) => {
            setConfirming(false);
            if (done) {
              setCodeInput('');
              setReason('');
              setTouched(false);
            }
          });
        }}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
