import { useCallback, useEffect, useMemo, useState } from 'react';
import { ListFooter, useListWindow } from '@/components/admin/ListWindow';
import { NoteDialog } from '@/components/admin/NoteDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
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
  { id: 'rejected', label: 'Reprovados' },
  { id: 'all', label: 'Todos' },
];

type Entry =
  | { kind: 'application'; id: string; createdAt: string; item: AmbassadorApplication }
  | { kind: 'signup'; id: string; createdAt: string; user: AdminUser };

function statusLabel(status: ApplicationStatus): string {
  switch (status) {
    case 'pending':
      return 'Aguardando';
    case 'approved':
      return 'Aprovado';
    case 'rejected':
      return 'Reprovado';
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

function networksLine(item: AmbassadorApplication): string {
  const names = [
    item.redes_sociais.includes('instagram') ? 'Instagram' : null,
    item.redes_sociais.includes('tiktok') ? 'TikTok' : null,
  ].filter((name): name is string => name !== null);
  return names.length > 0 ? names.join(' e ') : 'Sem rede informada';
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
  /** Pessoas com conta; as pendentes sem candidatura aparecem aqui para aprovar. */
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
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('pending');
  const [openId, setOpenId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [pendingReject, setPendingReject] = useState<AmbassadorApplication | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<AmbassadorApplication | null>(null);

  const load = useCallback(async () => {
    if (preview) {
      const demo = await import('@/components/admin/previewData');
      setApplications(demo.previewApplications);
      setLoading(false);
      return;
    }
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
  // Quem preencheu o cadastro aparece pela candidatura; aqui ficam só as contas sem formulário.
  const directSignups = useMemo(
    () =>
      pendingSignups.filter(
        (user) =>
          user.status === 'pending' &&
          user.role !== 'admin' &&
          !applicationEmails.has(user.email.toLowerCase()),
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

  const entries = useMemo<Entry[]>(() => {
    const fromApplications: Entry[] = applications
      .filter((item) => filter === 'all' || item.status === filter)
      .map((item) => ({ kind: 'application', id: item.id, createdAt: item.created_at, item }));
    const fromSignups: Entry[] =
      filter === 'pending' || filter === 'all'
        ? directSignups.map((user) => ({
            kind: 'signup',
            id: user.id,
            createdAt: user.createdAt,
            user,
          }))
        : [];
    return [...fromApplications, ...fromSignups].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }, [applications, directSignups, filter]);

  const list = useListWindow(entries.length);

  async function review(item: AmbassadorApplication, status: ApplicationStatus, note?: string) {
    setUpdatingId(item.id);
    try {
      const updated: AmbassadorApplication = preview
        ? {
            ...item,
            status,
            reviewed_at: new Date().toISOString(),
            reviewed_by_name: 'Você',
            review_note: status === 'rejected' ? (note ?? null) : null,
          }
        : await api.updateApplication(item.id, status, note);
      setApplications((current) => current.map((row) => (row.id === item.id ? updated : row)));
      onMessage(
        status === 'approved'
          ? `${updated.nome_completo} aprovado. O acesso foi liberado, as contas informadas entram no ranking e a pessoa recebeu o aviso no app.`
          : `Cadastro de ${updated.nome_completo} reprovado. O motivo aparece no app.`,
      );
      if (!preview) onChanged();
    } catch (err) {
      onError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível salvar a decisão. Confira a internet e tente de novo.',
      );
    } finally {
      setUpdatingId(null);
      setPendingReject(null);
    }
  }

  async function remove(item: AmbassadorApplication) {
    setUpdatingId(item.id);
    try {
      if (!preview) await api.deleteApplication(item.id);
      setApplications((current) => current.filter((row) => row.id !== item.id));
      setOpenId(null);
      onMessage(`Cadastro de ${item.nome_completo} excluído.`);
    } catch (err) {
      onError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível excluir o cadastro. Confira a internet e tente de novo.',
      );
    } finally {
      setUpdatingId(null);
      setPendingRemoval(null);
    }
  }

  function renderApplication(item: AmbassadorApplication) {
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
            {networksLine(item)} · cadastro em {formatWhen(item.created_at)}
          </span>
        </div>
        <div className="admin-actions">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`member-${item.id}`}
            onClick={() => setOpenId(open ? null : item.id)}
          >
            {open ? 'Ocultar dados' : 'Ver dados'}
          </button>
          {item.status === 'pending' ? (
            <button
              type="button"
              className="is-stop"
              disabled={busy}
              onClick={() => setPendingReject(item)}
            >
              Reprovar
            </button>
          ) : null}
          {item.status !== 'approved' ? (
            <button
              type="button"
              className="admin-primary"
              disabled={busy}
              onClick={() => void review(item, 'approved')}
            >
              {busy ? 'Salvando...' : item.status === 'rejected' ? 'Aprovar mesmo assim' : 'Aprovar'}
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
              <dt>Cadastro em</dt>
              <dd>{formatWhen(item.created_at)}</dd>
            </div>
            {item.reviewed_at ? (
              <div>
                <dt>{item.status === 'approved' ? 'Aprovado em' : 'Reprovado em'}</dt>
                <dd>
                  {formatWhen(item.reviewed_at)}
                  {item.reviewed_by_name ? ` por ${item.reviewed_by_name}` : ''}
                </dd>
              </div>
            ) : null}
            {item.review_note ? (
              <div>
                <dt>Motivo enviado</dt>
                <dd>{item.review_note}</dd>
              </div>
            ) : null}
            <div className="admin-details-foot">
              <span className="admin-meta">
                Excluir apaga os dados do cadastro. O acesso de quem já foi aprovado continua.
              </span>
              <button
                type="button"
                className="is-stop"
                disabled={busy}
                onClick={() => setPendingRemoval(item)}
              >
                Excluir cadastro
              </button>
            </div>
          </dl>
        ) : null}
      </article>
    );
  }

  function renderSignup(user: AdminUser) {
    const open = openId === user.id;
    const busy = approvingUserId === user.id;
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
          <span>Conta criada sem o cadastro completo · {formatWhen(user.createdAt)}</span>
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
            disabled={busy}
            onClick={() => onApproveSignup(user.id)}
          >
            {busy ? 'Salvando...' : 'Aprovar'}
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
              Essa pessoa criou a conta, mas não completou o cadastro, por isso não há WhatsApp nem
              @ das redes. Ao aprovar, ela ganha acesso e pode informar o @ pelo app.
            </p>
          </dl>
        ) : null}
      </article>
    );
  }

  return (
    <section className="admin-panel" aria-labelledby="new-members-title">
      <div className="admin-panel-head">
        <h2 id="new-members-title">Cadastros</h2>
        <p>
          Quem entrou no programa pelo site. Ao aprovar, a pessoa ganha acesso completo e as contas
          que ela informou entram no ranking.
        </p>
      </div>
      <div className="admin-toolbar">
        <div className="admin-segment" role="group" aria-label="Filtrar por situação">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => {
                setFilter(item.id);
                setOpenId(null);
                list.reset();
              }}
            >
              {item.label}
              {loading ? null : <span className="admin-segment-count">{counts[item.id]}</span>}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="admin-row">
          <Spinner label="Carregando cadastros..." />
        </div>
      ) : null}

      {loadFailed ? (
        <div className="admin-empty" role="alert">
          <strong>Não foi possível carregar os cadastros</strong>
          <p>Confira a internet e tente de novo. Se continuar, avise o suporte técnico.</p>
          <div className="admin-actions">
            <button type="button" onClick={() => void load()}>
              Tentar de novo
            </button>
          </div>
        </div>
      ) : null}

      {!loading && !loadFailed && entries.length === 0 ? (
        <div className="admin-empty" role="status">
          <strong>
            {filter === 'pending' ? 'Ninguém aguardando aprovação' : 'Nada com esse filtro'}
          </strong>
          <p>
            {filter === 'pending'
              ? 'Quando alguém se cadastrar no site, o pedido aparece aqui para você aprovar.'
              : 'Escolha outro filtro para ver os demais cadastros.'}
          </p>
          {filter !== 'all' && counts.all > 0 ? (
            <div className="admin-actions">
              <button
                type="button"
                onClick={() => {
                  setFilter('all');
                  list.reset();
                }}
              >
                Ver todos os cadastros
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {entries
        .slice(list.start, list.end)
        .map((entry) =>
          entry.kind === 'application' ? renderApplication(entry.item) : renderSignup(entry.user),
        )}

      <ListFooter list={list} label="cadastros" />

      <NoteDialog
        open={pendingReject !== null}
        title={`Reprovar o cadastro de ${pendingReject?.nome_completo ?? ''}?`}
        description="As redes dessa pessoa ficam fora do ranking e ela vê o motivo no app. Você pode aprovar depois, se mudar de ideia."
        confirmLabel="Reprovar cadastro"
        suggestions={[
          'O perfil não publica conteúdo do programa.',
          'Os dados do cadastro não conferem com o perfil informado.',
        ]}
        busy={pendingReject !== null && updatingId === pendingReject.id}
        onConfirm={(note) => {
          if (pendingReject) void review(pendingReject, 'rejected', note);
        }}
        onCancel={() => setPendingReject(null)}
      />

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={`Excluir o cadastro de ${pendingRemoval?.nome_completo ?? ''}?`}
        description="Os dados do formulário são apagados e não podem ser recuperados. O acesso de quem já foi aprovado continua."
        confirmLabel="Excluir cadastro"
        busy={pendingRemoval !== null && updatingId === pendingRemoval.id}
        onConfirm={() => {
          if (pendingRemoval) void remove(pendingRemoval);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </section>
  );
}
