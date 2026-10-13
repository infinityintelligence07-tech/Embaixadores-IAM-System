import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import {
  ApiError,
  api,
  type AdminUser,
  type AmbassadorApplication,
  type ApplicationStatus,
} from '@/lib/api';

type Filter = ApplicationStatus | 'all';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'pending', label: 'Aguardando' },
  { id: 'approved', label: 'Aprovados' },
  { id: 'rejected', label: 'Rejeitados' },
  { id: 'all', label: 'Todos' },
];

const PAGE_SIZE = 10;

function statusLabel(status: ApplicationStatus): string {
  switch (status) {
    case 'pending':
      return 'Aguardando';
    case 'approved':
      return 'Aprovado';
    case 'rejected':
      return 'Rejeitado';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function statusTone(status: ApplicationStatus): 'ok' | 'wait' | 'stop' {
  switch (status) {
    case 'pending':
      return 'wait';
    case 'approved':
      return 'ok';
    case 'rejected':
      return 'stop';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function formatWhen(value: string | null): string {
  if (!value) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}

/** Aceita "@fulano", "fulano" ou a URL do perfil colada no formulário. */
function cleanHandle(value: string | null): string | null {
  if (!value) return null;
  const clean = value
    .trim()
    .replace(/^@+/, '')
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.|m\.)?(instagram|tiktok)\.com\//i, '')
    .split(/[/?#\s]/)[0]
    .replace(/^@+/, '');
  return clean || null;
}

function profileLink(network: 'instagram' | 'tiktok', handle: string): string {
  return network === 'instagram'
    ? `https://www.instagram.com/${encodeURIComponent(handle)}/`
    : `https://www.tiktok.com/@${encodeURIComponent(handle)}`;
}

function formatPhone(digits: string): string {
  const local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return `+${digits}`;
}

function whatsappLink(digits: string): string {
  const full = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${full}`;
}

function NetworkLine({
  network,
  handle,
  fallback,
}: {
  network: 'instagram' | 'tiktok';
  handle: string | null;
  fallback: string;
}) {
  const clean = cleanHandle(handle);
  if (!clean) return <>{fallback}</>;
  return (
    <a href={profileLink(network, clean)} target="_blank" rel="noreferrer">
      @{clean}
    </a>
  );
}

export function NewMembersSection({
  pendingSignups,
  preview,
  approvingUserId,
  onApproveSignup,
  onChanged,
  onPendingCount,
  onMessage,
  onError,
}: {
  /** Cadastros feitos direto no site, ainda aguardando aprovação. */
  pendingSignups: AdminUser[];
  preview: boolean;
  approvingUserId: string | null;
  onApproveSignup: (userId: string) => void;
  onChanged: () => void;
  onPendingCount: (count: number) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [applications, setApplications] = useState<AmbassadorApplication[]>([]);
  const [loading, setLoading] = useState(!preview);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('pending');
  const [openId, setOpenId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [pendingReject, setPendingReject] = useState<AmbassadorApplication | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<AmbassadorApplication | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    if (preview) return;
    try {
      setApplications(await api.applications());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [preview]);

  useEffect(() => {
    void load();
  }, [load]);

  const applicationEmails = useMemo(
    () => new Set(applications.map((item) => item.email.toLowerCase())),
    [applications],
  );
  // Quem preencheu o formulário já aparece pela candidatura; aqui ficam só os cadastros diretos.
  const directSignups = useMemo(
    () =>
      pendingSignups.filter(
        (user) => user.status === 'pending' && !applicationEmails.has(user.email.toLowerCase()),
      ),
    [applicationEmails, pendingSignups],
  );

  const counts = useMemo(() => {
    const byStatus: Record<Filter, number> = { pending: 0, approved: 0, rejected: 0, all: 0 };
    for (const item of applications) {
      byStatus[item.status] += 1;
      byStatus.all += 1;
    }
    byStatus.pending += directSignups.length;
    byStatus.all += directSignups.length;
    return byStatus;
  }, [applications, directSignups]);

  useEffect(() => {
    if (!loading) onPendingCount(counts.pending);
  }, [counts.pending, loading, onPendingCount]);

  const shownApplications = useMemo(
    () => (filter === 'all' ? applications : applications.filter((item) => item.status === filter)),
    [applications, filter],
  );
  const shownSignups = filter === 'pending' || filter === 'all' ? directSignups : [];
  const total = shownApplications.length + shownSignups.length;

  async function review(item: AmbassadorApplication, status: ApplicationStatus) {
    setUpdatingId(item.id);
    try {
      const updated = await api.updateApplication(item.id, status);
      setApplications((current) => current.map((row) => (row.id === item.id ? updated : row)));
      onMessage(
        status === 'approved'
          ? `${updated.nome_completo} aprovado. O acesso foi criado e o convite foi enviado para ${updated.email}.`
          : `Candidatura de ${updated.nome_completo} rejeitada.`,
      );
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Não foi possível atualizar a candidatura.');
    } finally {
      setUpdatingId(null);
      setPendingReject(null);
    }
  }

  async function remove(item: AmbassadorApplication) {
    setUpdatingId(item.id);
    try {
      await api.deleteApplication(item.id);
      setApplications((current) => current.filter((row) => row.id !== item.id));
      onMessage('Candidatura excluída.');
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Não foi possível excluir a candidatura.');
    } finally {
      setUpdatingId(null);
      setPendingRemoval(null);
    }
  }

  return (
    <section className="admin-panel" aria-label="Novos membros">
      <h2>Novos membros</h2>
      <div className="admin-row">
        <div className="admin-actions" role="group" aria-label="Filtrar por situação">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => {
                setFilter(item.id);
                setVisible(PAGE_SIZE);
              }}
            >
              {item.label} ({counts[item.id]})
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="admin-row">
          <Spinner label="Carregando candidaturas..." />
        </div>
      ) : null}

      {loadFailed ? (
        <div className="admin-row">
          <span className="admin-meta">Não foi possível carregar as candidaturas.</span>
          <button type="button" className="admin-more" onClick={() => void load()}>
            Tentar de novo
          </button>
        </div>
      ) : null}

      {!loading && !loadFailed && total === 0 ? (
        <EmptyState
          title={filter === 'pending' ? 'Ninguém aguardando aprovação' : 'Nada com esse filtro'}
          description={
            filter === 'pending'
              ? 'Quando alguém preencher o formulário ou criar conta no site, aparece aqui.'
              : 'Troque o filtro para ver outras candidaturas.'
          }
        />
      ) : null}

      {shownApplications.slice(0, visible).map((item) => {
        const open = openId === item.id;
        const busy = updatingId === item.id;
        return (
          <article key={item.id} className="admin-row admin-member">
            <div className="admin-person">
              <strong>
                {item.nome_completo}
                <span className="admin-status" data-tone={statusTone(item.status)}>
                  <i />
                  {statusLabel(item.status)}
                </span>
              </strong>
              <span>
                Formulário · enviado em {formatWhen(item.created_at)}
              </span>
            </div>
            <div className="admin-actions">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`member-${item.id}`}
                onClick={() => setOpenId(open ? null : item.id)}
              >
                {open ? 'Ocultar dados' : 'Ver dados do formulário'}
              </button>
              {item.status !== 'approved' ? (
                <button
                  type="button"
                  className="admin-primary"
                  disabled={busy || preview}
                  onClick={() => void review(item, 'approved')}
                >
                  Aprovar
                </button>
              ) : null}
              {item.status === 'pending' ? (
                <button
                  type="button"
                  className="is-stop"
                  disabled={busy || preview}
                  onClick={() => setPendingReject(item)}
                >
                  Rejeitar
                </button>
              ) : null}
            </div>

            {open ? (
              <dl id={`member-${item.id}`} className="admin-details">
                <div>
                  <dt>Nome completo</dt>
                  <dd>{item.nome_completo}</dd>
                </div>
                <div>
                  <dt>E-mail</dt>
                  <dd>
                    <a href={`mailto:${item.email}`}>{item.email}</a>
                  </dd>
                </div>
                <div>
                  <dt>WhatsApp</dt>
                  <dd>
                    <a href={whatsappLink(item.whatsapp)} target="_blank" rel="noreferrer">
                      {formatPhone(item.whatsapp)}
                    </a>
                  </dd>
                </div>
                {item.redes_sociais.includes('instagram') ? (
                  <div>
                    <dt>Instagram</dt>
                    <dd>
                      <NetworkLine
                        network="instagram"
                        handle={item.instagram_handle}
                        fallback={item.nome_conta}
                      />
                    </dd>
                  </div>
                ) : null}
                {item.redes_sociais.includes('tiktok') ? (
                  <div>
                    <dt>TikTok</dt>
                    <dd>
                      <NetworkLine
                        network="tiktok"
                        handle={item.tiktok_handle}
                        fallback={item.nome_conta}
                      />
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt>Enviado em</dt>
                  <dd>{formatWhen(item.created_at)}</dd>
                </div>
                {item.reviewed_at ? (
                  <div>
                    <dt>{item.status === 'approved' ? 'Aprovado' : 'Rejeitado'}</dt>
                    <dd>
                      {formatWhen(item.reviewed_at)}
                      {item.reviewed_by_name ? ` por ${item.reviewed_by_name}` : ''}
                    </dd>
                  </div>
                ) : null}
                <div className="admin-details-foot">
                  <button
                    type="button"
                    className="is-stop"
                    disabled={busy || preview}
                    onClick={() => setPendingRemoval(item)}
                  >
                    Excluir candidatura
                  </button>
                </div>
              </dl>
            ) : null}
          </article>
        );
      })}

      {shownSignups.map((user) => {
        const open = openId === user.id;
        return (
          <article key={user.id} className="admin-row admin-member">
            <div className="admin-person">
              <strong>
                {user.fullName || user.publicName}
                <span className="admin-status" data-tone="wait">
                  <i />
                  Aguardando
                </span>
              </strong>
              <span>Criou conta direto no site · {formatWhen(user.createdAt)}</span>
            </div>
            <div className="admin-actions">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`member-${user.id}`}
                onClick={() => setOpenId(open ? null : user.id)}
              >
                {open ? 'Ocultar dados' : 'Ver dados'}
              </button>
              <button
                type="button"
                className="admin-primary"
                disabled={approvingUserId === user.id}
                onClick={() => onApproveSignup(user.id)}
              >
                Aprovar
              </button>
            </div>

            {open ? (
              <dl id={`member-${user.id}`} className="admin-details">
                <div>
                  <dt>Nome completo</dt>
                  <dd>{user.fullName || 'Não informado'}</dd>
                </div>
                <div>
                  <dt>Nome público</dt>
                  <dd>{user.publicName}</dd>
                </div>
                <div>
                  <dt>E-mail</dt>
                  <dd>
                    <a href={`mailto:${user.email}`}>{user.email}</a>
                  </dd>
                </div>
                <div>
                  <dt>Conta criada em</dt>
                  <dd>{formatWhen(user.createdAt)}</dd>
                </div>
                <p className="admin-details-note">
                  Essa pessoa criou conta pela tela de cadastro e não preencheu o formulário de
                  candidatura, por isso não há WhatsApp nem @ das redes.
                </p>
              </dl>
            ) : null}
          </article>
        );
      })}

      {shownApplications.length > visible ? (
        <div className="admin-row">
          <button
            type="button"
            className="admin-more"
            onClick={() => setVisible((count) => count + PAGE_SIZE)}
          >
            Mostrar mais {Math.min(PAGE_SIZE, shownApplications.length - visible)} de{' '}
            {shownApplications.length - visible} restantes
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingReject !== null}
        title={`Rejeitar a candidatura de ${pendingReject?.nome_completo ?? ''}?`}
        description="A pessoa não recebe acesso. Você pode aprovar depois, se mudar de ideia."
        confirmLabel="Rejeitar"
        busy={pendingReject !== null && updatingId === pendingReject.id}
        onConfirm={() => {
          if (pendingReject) void review(pendingReject, 'rejected');
        }}
        onCancel={() => setPendingReject(null)}
      />

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={`Excluir a candidatura de ${pendingRemoval?.nome_completo ?? ''}?`}
        description="Os dados do formulário são apagados e não podem ser recuperados. O acesso de quem já foi aprovado continua."
        confirmLabel="Excluir"
        busy={pendingRemoval !== null && updatingId === pendingRemoval.id}
        onConfirm={() => {
          if (pendingRemoval) void remove(pendingRemoval);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </section>
  );
}
