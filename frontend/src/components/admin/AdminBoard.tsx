import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactElement } from 'react';
import { useListWindow } from '@/components/admin/ListWindow';
import { NoteDialog } from '@/components/admin/NoteDialog';
import { PlatformMark } from '@/components/brand/PlatformMark';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import {
  ApiError,
  api,
  type AccountReviewItem,
  type AdminUser,
  type AmbassadorApplication,
  type SocialPlatform,
  type UserStatus,
} from '@/lib/api';

type Column = 'waiting' | 'adjust' | 'approved' | 'out';

const COLUMNS: { id: Column; title: string; hint: string; empty: string }[] = [
  {
    id: 'waiting',
    title: 'Aguardando',
    hint: 'Cadastros e redes esperando a sua decisão.',
    empty: 'Ninguém esperando. Quem se cadastrar no site aparece aqui.',
  },
  {
    id: 'adjust',
    title: 'Ajuste pedido',
    hint: 'A pessoa recebeu o recado e avisa no app quando ajustar.',
    empty: 'Nenhum ajuste em aberto.',
  },
  {
    id: 'approved',
    title: 'Aprovados',
    hint: 'Acesso liberado e redes contando no ranking.',
    empty: 'Ninguém aprovado ainda. Arraste alguém para cá.',
  },
  {
    id: 'out',
    title: 'Reprovados',
    hint: 'Fora do ranking. Dá para aprovar depois.',
    empty: 'Ninguém reprovado.',
  },
];

/** Para onde cada coluna pode ir. Voltar para "Aguardando" não é uma decisão. */
const MOVES: Record<Column, Column[]> = {
  waiting: ['adjust', 'approved', 'out'],
  adjust: ['approved', 'out'],
  approved: ['out'],
  out: ['approved'],
};

const ADJUST_SUGGESTIONS = [
  'Deixe o perfil público para as views entrarem.',
  'Use o mesmo @ que você informou no cadastro.',
  'Publique os cortes como Reels, não como foto ou carrossel.',
];

const REJECT_SUGGESTIONS = [
  'O perfil não publica conteúdo do programa.',
  'Esse @ não é da pessoa que fez o cadastro.',
];

interface Handle {
  platform: SocialPlatform;
  handle: string;
  href: string;
}

interface Person {
  key: string;
  name: string;
  email: string;
  user: AdminUser | null;
  app: AmbassadorApplication | null;
  accounts: AccountReviewItem[];
  handles: Handle[];
  column: Column;
  tag: { label: string; tone: 'wait' | 'stop' } | null;
  since: string;
  note: string | null;
  whatsapp: string | null;
}

type Pending =
  | { kind: 'adjust'; person: Person }
  | { kind: 'reject'; person: Person }
  | { kind: 'suspend'; person: Person }
  | { kind: 'delete'; person: Person };

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

function profileLink(platform: SocialPlatform, handle: string): string {
  return platform === 'instagram'
    ? `https://www.instagram.com/${encodeURIComponent(handle)}/`
    : `https://www.tiktok.com/@${encodeURIComponent(handle)}`;
}

function waDigits(raw: string | null): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.length <= 11 ? `55${digits}` : digits;
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return raw;
}

function firstName(person: Person): string {
  return person.name.split(' ')[0] || person.name;
}

function noticeFor(person: Person, decision: 'approved' | 'adjust' | 'reject', note = ''): string {
  const name = firstName(person);
  switch (decision) {
    case 'approved':
      return `Oi, ${name}! Seu cadastro nos Embaixadores foi aprovado e as suas redes já entram no ranking.`;
    case 'adjust':
      return `Oi, ${name}! Para entrar no ranking dos Embaixadores, falta um ajuste: ${note} Depois, toque em "Já ajustei" no app.`;
    case 'reject':
      return `Oi, ${name}. Seu cadastro nos Embaixadores não foi aprovado: ${note}`;
  }
}

/** Junta cadastro, conta e redes da mesma pessoa num cartão só, e decide a coluna. */
function buildPeople(
  users: AdminUser[],
  applications: AmbassadorApplication[],
  reviews: AccountReviewItem[],
): Person[] {
  const latestApp = new Map<string, AmbassadorApplication>();
  for (const app of applications) {
    const key = app.email.trim().toLowerCase();
    const current = latestApp.get(key);
    if (!current || current.created_at < app.created_at) latestApp.set(key, app);
  }
  const reviewsByKey = new Map<string, AccountReviewItem[]>();
  for (const item of reviews) {
    const key = item.email.trim().toLowerCase();
    reviewsByKey.set(key, [...(reviewsByKey.get(key) ?? []), item]);
  }
  const usersByKey = new Map<string, AdminUser>();
  for (const user of users) usersByKey.set(user.email.trim().toLowerCase(), user);

  const team = new Set(users.filter((user) => user.role === 'admin').map((user) => user.email.trim().toLowerCase()));
  const keys = new Set([...usersByKey.keys(), ...latestApp.keys(), ...reviewsByKey.keys()]);

  const people: Person[] = [];
  for (const key of keys) {
    if (team.has(key)) continue;
    const user = usersByKey.get(key) ?? null;
    const app = latestApp.get(key) ?? null;
    const accounts = reviewsByKey.get(key) ?? [];

    const handles: Handle[] = [];
    for (const platform of ['instagram', 'tiktok'] as const) {
      const fromAccount = accounts.find((item) => item.platform === platform)?.username ?? null;
      const fromApp = app?.redes_sociais.includes(platform)
        ? platform === 'instagram'
          ? app.instagram_handle
          : app.tiktok_handle
        : null;
      const handle = cleanHandle(fromAccount) ?? cleanHandle(fromApp);
      if (handle) handles.push({ platform, handle, href: profileLink(platform, handle) });
    }

    let column: Column;
    let tag: Person['tag'] = null;
    if (user?.status === 'suspended') {
      column = 'out';
      tag = { label: 'Suspenso', tone: 'stop' };
    } else if (app?.status === 'rejected') {
      column = 'out';
    } else if (accounts.some((item) => item.reviewStatus === 'pending')) {
      column = 'waiting';
    } else if (accounts.some((item) => item.reviewStatus === 'changes_requested')) {
      column = 'adjust';
    } else if (app?.status === 'pending' || user?.status === 'pending') {
      column = 'waiting';
      if (!app) tag = { label: 'Cadastro incompleto', tone: 'wait' };
    } else {
      column = 'approved';
    }

    const note =
      column === 'adjust'
        ? accounts.find((item) => item.reviewStatus === 'changes_requested')?.reviewNote ?? null
        : column === 'out'
          ? app?.review_note ?? null
          : null;

    people.push({
      key,
      name: app?.nome_completo || user?.fullName || user?.publicName || accounts[0]?.fullName || key,
      email: app?.email || user?.email || accounts[0]?.email || key,
      user,
      app,
      accounts,
      handles,
      column,
      tag,
      since: app?.created_at || user?.createdAt || accounts[0]?.connectedAt || '',
      note,
      whatsapp: app?.whatsapp || accounts.find((item) => item.whatsapp)?.whatsapp || null,
    });
  }
  return people;
}

export function AdminBoard({
  users,
  preview,
  onChanged,
  onWaitingCount,
  onMessage,
  onError,
}: {
  users: AdminUser[];
  preview: boolean;
  /** Recarrega as pessoas da página depois de uma decisão. */
  onChanged: () => Promise<void> | void;
  onWaitingCount: (count: number) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [applications, setApplications] = useState<AmbassadorApplication[]>([]);
  const [reviews, setReviews] = useState<AccountReviewItem[]>([]);
  const [statusOverride, setStatusOverride] = useState<Record<string, UserStatus>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Person | null>(null);
  const [over, setOver] = useState<Column | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<{ name: string; href: string } | null>(null);

  const load = useCallback(async () => {
    if (preview) {
      const demo = await import('@/components/admin/previewData');
      setApplications(demo.previewApplications);
      setReviews(demo.previewAccountReviews);
      setLoading(false);
      return;
    }
    try {
      const [apps, open] = await Promise.all([api.applications(), api.adminAccountReviews()]);
      setApplications(apps);
      setReviews(open);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [preview]);

  useEffect(() => {
    void load();
  }, [load]);

  const people = useMemo(() => {
    const merged = users.map((user) =>
      statusOverride[user.id] ? { ...user, status: statusOverride[user.id] } : user,
    );
    return buildPeople(merged, applications, reviews);
  }, [users, applications, reviews, statusOverride]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase().replace(/^@/, '');
    if (!term) return people;
    return people.filter(
      (person) =>
        person.name.toLowerCase().includes(term) ||
        person.email.toLowerCase().includes(term) ||
        person.handles.some((item) => item.handle.toLowerCase().includes(term)),
    );
  }, [people, query]);

  const byColumn = useMemo(() => {
    const groups: Record<Column, Person[]> = { waiting: [], adjust: [], approved: [], out: [] };
    for (const person of visible) groups[person.column].push(person);
    // Quem espera há mais tempo vem primeiro; nas colunas de decisão tomada, o mais recente.
    groups.waiting.sort((a, b) => a.since.localeCompare(b.since));
    groups.adjust.sort((a, b) => a.since.localeCompare(b.since));
    groups.approved.sort((a, b) => b.since.localeCompare(a.since));
    groups.out.sort((a, b) => b.since.localeCompare(a.since));
    return groups;
  }, [visible]);

  const waitingTotal = useMemo(
    () => people.filter((person) => person.column === 'waiting').length,
    [people],
  );
  useEffect(() => {
    if (!loading) onWaitingCount(waitingTotal);
  }, [loading, onWaitingCount, waitingTotal]);

  async function refresh() {
    if (preview) return;
    await Promise.all([load(), onChanged()]);
  }

  function offerWhatsApp(person: Person, text: string) {
    const digits = waDigits(person.whatsapp);
    setNotice(
      digits
        ? { name: firstName(person), href: `https://wa.me/${digits}?text=${encodeURIComponent(text)}` }
        : null,
    );
  }

  function failure(err: unknown, fallback: string) {
    onError(err instanceof ApiError ? err.message : fallback);
  }

  async function approve(person: Person) {
    setBusyKey(person.key);
    try {
      if (preview) {
        setApplications((rows) =>
          rows.map((row) => (row.id === person.app?.id ? { ...row, status: 'approved', review_note: null } : row)),
        );
        setReviews((rows) => rows.filter((row) => !person.accounts.includes(row)));
        if (person.user) setStatusOverride((map) => ({ ...map, [person.user!.id]: 'approved' }));
      } else {
        let accountsLeft = person.accounts;
        if (person.app && person.app.status !== 'approved') {
          await api.updateApplication(person.app.id, 'approved');
          accountsLeft = person.accounts.filter((item) => item.reviewStatus === 'changes_requested');
        } else if (person.user && person.user.status !== 'approved') {
          await api.adminApproveUser(person.user.id);
          accountsLeft = person.accounts.filter((item) => item.reviewStatus === 'changes_requested');
        }
        for (const account of accountsLeft) {
          await api.adminReviewAccount(account.accountId, 'approved');
        }
      }
      onMessage(
        `${person.name} aprovado. O acesso foi liberado, as redes entram no ranking na próxima atualização e a pessoa recebeu o aviso no app.`,
      );
      offerWhatsApp(person, noticeFor(person, 'approved'));
      await refresh();
    } catch (err) {
      failure(err, 'Não foi possível aprovar. Confira a internet e tente de novo.');
    } finally {
      setBusyKey(null);
    }
  }

  async function requestAdjust(person: Person, note: string) {
    const waiting = person.accounts.filter((item) => item.reviewStatus === 'pending');
    setBusyKey(person.key);
    try {
      if (preview) {
        setReviews((rows) =>
          rows.map((row) =>
            waiting.includes(row) ? { ...row, reviewStatus: 'changes_requested', reviewNote: note } : row,
          ),
        );
      } else {
        for (const account of waiting) {
          await api.adminReviewAccount(account.accountId, 'changes_requested', note);
        }
      }
      onMessage(`Ajuste pedido para ${person.name}. O recado aparece no app.`);
      offerWhatsApp(person, noticeFor(person, 'adjust', note));
      await refresh();
    } catch (err) {
      failure(err, 'Não foi possível pedir o ajuste. Confira a internet e tente de novo.');
    } finally {
      setBusyKey(null);
      setPending(null);
    }
  }

  async function reject(person: Person, note: string) {
    setBusyKey(person.key);
    try {
      if (preview) {
        setApplications((rows) =>
          rows.map((row) => (row.id === person.app?.id ? { ...row, status: 'rejected', review_note: note } : row)),
        );
        setReviews((rows) => rows.filter((row) => !person.accounts.includes(row)));
      } else if (person.app) {
        await api.updateApplication(person.app.id, 'rejected', note);
      } else {
        for (const account of person.accounts) {
          await api.adminReviewAccount(account.accountId, 'rejected', note);
        }
      }
      onMessage(`${person.name} reprovado. O motivo aparece no app.`);
      offerWhatsApp(person, noticeFor(person, 'reject', note));
      await refresh();
    } catch (err) {
      failure(err, 'Não foi possível reprovar. Confira a internet e tente de novo.');
    } finally {
      setBusyKey(null);
      setPending(null);
    }
  }

  async function suspend(person: Person) {
    if (!person.user) return;
    setBusyKey(person.key);
    try {
      if (preview) {
        setStatusOverride((map) => ({ ...map, [person.user!.id]: 'suspended' }));
      } else {
        await api.adminSuspendUser(person.user.id);
      }
      onMessage(`${person.name} suspenso. Saiu do ranking e perdeu o acesso. Dá para aprovar de novo depois.`);
      setNotice(null);
      await refresh();
    } catch (err) {
      failure(err, 'Não foi possível suspender. Confira a internet e tente de novo.');
    } finally {
      setBusyKey(null);
      setPending(null);
    }
  }

  async function removeApplication(person: Person) {
    if (!person.app) return;
    setBusyKey(person.key);
    try {
      if (preview) {
        setApplications((rows) => rows.filter((row) => row.id !== person.app?.id));
      } else {
        await api.deleteApplication(person.app.id);
      }
      setOpenKey(null);
      onMessage(`Cadastro de ${person.name} excluído.`);
      await refresh();
    } catch (err) {
      failure(err, 'Não foi possível excluir o cadastro. Confira a internet e tente de novo.');
    } finally {
      setBusyKey(null);
      setPending(null);
    }
  }

  /** Reprovar usa o cadastro ou as redes; sem nenhum dos dois, o caminho é suspender o acesso. */
  function askReject(person: Person) {
    if (person.app || person.accounts.length > 0) setPending({ kind: 'reject', person });
    else setPending({ kind: 'suspend', person });
  }

  function move(person: Person, to: Column) {
    if (person.column === to) return;
    if (!MOVES[person.column].includes(to)) {
      onError(
        to === 'waiting'
          ? 'Aguardando é só para quem ainda não teve decisão. Escolha aprovar, pedir ajuste ou reprovar.'
          : 'Essa mudança não existe. Use os botões do cartão.',
      );
      return;
    }
    if (to === 'approved') void approve(person);
    else if (to === 'adjust') {
      if (!person.accounts.some((item) => item.reviewStatus === 'pending')) {
        onError(`${person.name} ainda não informou um @. Peça pelo WhatsApp ou aprove o cadastro.`);
        return;
      }
      setPending({ kind: 'adjust', person });
    } else if (to === 'out') askReject(person);
  }

  function onDragStart(event: DragEvent<HTMLLIElement>, person: Person) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', person.key);
    setDragging(person);
  }

  function onDragEnd() {
    setDragging(null);
    setOver(null);
  }

  function onDrop(event: DragEvent<HTMLElement>, to: Column) {
    event.preventDefault();
    const person = dragging;
    setDragging(null);
    setOver(null);
    if (person) move(person, to);
  }

  return (
    <section className="admin-panel board-panel" aria-labelledby="board-title">
      <div className="admin-panel-head">
        <h2 id="board-title">Aprovações</h2>
        <p>
          Arraste a pessoa para a coluna da decisão ou use os botões do cartão. Aprovar libera o
          acesso e coloca as redes dela no ranking. Ajuste e reprovação pedem um recado, que a
          pessoa vê no app.
        </p>
      </div>
      <div className="admin-toolbar">
        <input
          className="board-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nome, @ ou e-mail"
          aria-label="Buscar por nome, @ ou e-mail"
        />
      </div>

      {notice ? (
        <div className="admin-row board-notice">
          <span className="admin-meta">Quer avisar {notice.name} no WhatsApp também?</span>
          <div className="admin-actions">
            <button type="button" onClick={() => setNotice(null)}>
              Agora não
            </button>
            <a href={notice.href} target="_blank" rel="noreferrer" onClick={() => setNotice(null)}>
              Abrir WhatsApp com o recado
            </a>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="admin-row">
          <Spinner label="Carregando aprovações..." />
        </div>
      ) : failed ? (
        <div className="admin-empty" role="alert">
          <strong>Não foi possível carregar as aprovações</strong>
          <p>Confira a internet e tente de novo. Se continuar, avise o suporte técnico.</p>
          <div className="admin-actions">
            <button type="button" onClick={() => void load()}>
              Tentar de novo
            </button>
          </div>
        </div>
      ) : (
        <div className="board" data-dragging={dragging ? 'true' : undefined}>
          {COLUMNS.map((column) => {
            const allowed = dragging ? MOVES[dragging.column].includes(column.id) : false;
            return (
              <BoardColumn
                key={column.id}
                column={column}
                people={byColumn[column.id]}
                searching={query.trim() !== ''}
                dropState={
                  !dragging || dragging.column === column.id
                    ? undefined
                    : allowed
                      ? over === column.id
                        ? 'over'
                        : 'open'
                      : 'closed'
                }
                onDragOver={(event) => {
                  if (!allowed) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  if (over !== column.id) setOver(column.id);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setOver((current) => (current === column.id ? null : current));
                  }
                }}
                onDrop={(event) => onDrop(event, column.id)}
                renderCard={(person) => (
                  <PersonCard
                    key={person.key}
                    person={person}
                    busy={busyKey === person.key}
                    disabled={busyKey !== null}
                    open={openKey === person.key}
                    onToggle={() => setOpenKey(openKey === person.key ? null : person.key)}
                    onDragStart={(event) => onDragStart(event, person)}
                    onDragEnd={onDragEnd}
                    onApprove={() => void approve(person)}
                    onAdjust={() => setPending({ kind: 'adjust', person })}
                    onReject={() => askReject(person)}
                    onSuspend={() => setPending({ kind: 'suspend', person })}
                    onDelete={() => setPending({ kind: 'delete', person })}
                  />
                )}
              />
            );
          })}
        </div>
      )}

      <NoteDialog
        open={pending?.kind === 'adjust' || pending?.kind === 'reject'}
        title={
          pending?.kind === 'adjust'
            ? `Pedir ajuste para ${pending.person.name}`
            : `Reprovar ${pending?.person.name ?? ''}?`
        }
        description={
          pending?.kind === 'adjust'
            ? 'As redes ficam fora do ranking até o ajuste. A pessoa vê o recado no app e avisa quando terminar.'
            : 'As redes dessa pessoa ficam fora do ranking e ela vê o motivo no app. Dá para aprovar depois.'
        }
        confirmLabel={pending?.kind === 'adjust' ? 'Enviar pedido de ajuste' : 'Reprovar'}
        tone={pending?.kind === 'adjust' ? 'primary' : 'danger'}
        suggestions={pending?.kind === 'adjust' ? ADJUST_SUGGESTIONS : REJECT_SUGGESTIONS}
        busy={pending !== null && busyKey === pending.person.key}
        onConfirm={(note) => {
          if (pending?.kind === 'adjust') void requestAdjust(pending.person, note);
          else if (pending?.kind === 'reject') void reject(pending.person, note);
        }}
        onCancel={() => setPending(null)}
      />

      <ConfirmDialog
        open={pending?.kind === 'suspend' || pending?.kind === 'delete'}
        title={
          pending?.kind === 'delete'
            ? `Excluir o cadastro de ${pending.person.name}?`
            : `Suspender ${pending?.person.name ?? ''}?`
        }
        description={
          pending?.kind === 'delete'
            ? 'Os dados do formulário são apagados e não podem ser recuperados. O acesso de quem já foi aprovado continua.'
            : 'A pessoa sai do ranking e perde o acesso ao app. Dá para aprovar de novo depois.'
        }
        confirmLabel={pending?.kind === 'delete' ? 'Excluir cadastro' : 'Suspender'}
        busy={pending !== null && busyKey === pending.person.key}
        onConfirm={() => {
          if (pending?.kind === 'delete') void removeApplication(pending.person);
          else if (pending?.kind === 'suspend') void suspend(pending.person);
        }}
        onCancel={() => setPending(null)}
      />
    </section>
  );
}

function BoardColumn({
  column,
  people,
  searching,
  dropState,
  onDragOver,
  onDragLeave,
  onDrop,
  renderCard,
}: {
  column: (typeof COLUMNS)[number];
  people: Person[];
  searching: boolean;
  dropState: 'open' | 'over' | 'closed' | undefined;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  renderCard: (person: Person) => ReactElement;
}) {
  const list = useListWindow(people.length);
  const titleId = `board-col-${column.id}`;
  const remaining = people.length - list.visible;
  return (
    <section
      className="board-col"
      data-col={column.id}
      data-drop={dropState}
      aria-labelledby={titleId}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="board-col-head">
        <h3 id={titleId}>
          {column.title}
          <span className="board-count">{people.length}</span>
        </h3>
        <p>{column.hint}</p>
      </header>
      {dropState === 'over' || dropState === 'open' ? (
        <p className="board-drop-hint" aria-hidden>
          Solte aqui
        </p>
      ) : null}
      {people.length === 0 ? (
        <p className="board-empty">{searching ? 'Ninguém com essa busca nesta coluna.' : column.empty}</p>
      ) : (
        <ol className="board-list">{people.slice(list.start, list.end).map(renderCard)}</ol>
      )}
      {list.paged ? (
        <nav className="board-pager" aria-label={`Páginas de ${column.title}`}>
          <button type="button" disabled={list.page <= 1} onClick={() => list.setPage(list.page - 1)}>
            Anterior
          </button>
          <span>
            {list.page} de {list.pages}
          </span>
          <button
            type="button"
            disabled={list.page >= list.pages}
            onClick={() => list.setPage(list.page + 1)}
          >
            Próxima
          </button>
        </nav>
      ) : remaining > 0 ? (
        <button type="button" className="board-more" onClick={list.showMore}>
          Mostrar mais {Math.min(10, remaining)} de {remaining}
        </button>
      ) : null}
    </section>
  );
}

function PersonCard({
  person,
  busy,
  disabled,
  open,
  onToggle,
  onDragStart,
  onDragEnd,
  onApprove,
  onAdjust,
  onReject,
  onSuspend,
  onDelete,
}: {
  person: Person;
  busy: boolean;
  disabled: boolean;
  open: boolean;
  onToggle: () => void;
  onDragStart: (event: DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
  onApprove: () => void;
  onAdjust: () => void;
  onReject: () => void;
  onSuspend: () => void;
  onDelete: () => void;
}) {
  const canAdjust = person.accounts.some((item) => item.reviewStatus === 'pending');
  const detailsId = `board-card-${person.key.replace(/[^a-z0-9]/gi, '-')}`;
  const digits = waDigits(person.whatsapp);
  const decidedAt = person.app?.reviewed_at ?? null;

  return (
    <li
      className="board-card"
      data-busy={busy ? 'true' : undefined}
      draggable={!disabled}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="board-card-head">
        <svg className="board-grip" width="10" height="16" viewBox="0 0 10 16" aria-hidden>
          {[2, 8, 14].map((y) => (
            <g key={y}>
              <circle cx="2" cy={y} r="1.5" />
              <circle cx="8" cy={y} r="1.5" />
            </g>
          ))}
        </svg>
        <strong>{person.name}</strong>
        {person.tag ? (
          <span className="admin-status" data-tone={person.tag.tone}>
            <i />
            {person.tag.label}
          </span>
        ) : null}
      </div>

      {person.handles.length > 0 ? (
        <ul className="board-handles">
          {person.handles.map((item) => (
            <li key={item.platform}>
              <PlatformMark platform={item.platform} size={18} />
              <a href={item.href} target="_blank" rel="noreferrer">
                @{item.handle}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="board-meta">Ainda sem @ informado</p>
      )}
      <p className="board-meta">Cadastro em {formatWhen(person.since)}</p>
      {person.note ? <p className="admin-note">Recado: {person.note}</p> : null}

      <div className="board-actions">
        {busy ? (
          <span className="board-meta">Salvando...</span>
        ) : person.column === 'waiting' || person.column === 'adjust' ? (
          <>
            <button type="button" className="admin-primary" disabled={disabled} onClick={onApprove}>
              Aprovar
            </button>
            {person.column === 'waiting' && canAdjust ? (
              <button type="button" disabled={disabled} onClick={onAdjust}>
                Pedir ajuste
              </button>
            ) : null}
            <button type="button" className="is-stop" disabled={disabled} onClick={onReject}>
              Reprovar
            </button>
          </>
        ) : person.column === 'out' ? (
          <button type="button" className="admin-primary" disabled={disabled} onClick={onApprove}>
            Aprovar mesmo assim
          </button>
        ) : null}
        <button
          type="button"
          className="board-toggle"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={onToggle}
        >
          {open ? 'Ocultar dados' : 'Ver dados'}
        </button>
      </div>

      {open ? (
        <dl id={detailsId} className="board-details">
          <div>
            <dt>E-mail</dt>
            <dd>
              <a href={`mailto:${person.email}`}>{person.email}</a>
            </dd>
          </div>
          <div>
            <dt>WhatsApp</dt>
            <dd>
              {digits && person.whatsapp ? (
                <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer">
                  {formatPhone(person.whatsapp)}
                </a>
              ) : (
                'Não informado'
              )}
            </dd>
          </div>
          {decidedAt ? (
            <div>
              <dt>Decisão em</dt>
              <dd>
                {formatWhen(decidedAt)}
                {person.app?.reviewed_by_name ? ` por ${person.app.reviewed_by_name}` : ''}
              </dd>
            </div>
          ) : null}
          {person.tag?.label === 'Cadastro incompleto' ? (
            <p className="board-meta">
              Criou a conta, mas ainda não informou WhatsApp e @. Ao aprovar, ela ganha acesso e
              informa o @ pelo app.
            </p>
          ) : null}
          {person.column === 'approved' && person.user ? (
            <div className="board-details-foot">
              <button type="button" className="is-stop" disabled={disabled} onClick={onSuspend}>
                Suspender acesso
              </button>
            </div>
          ) : null}
          {person.app ? (
            <div className="board-details-foot">
              <button type="button" className="is-stop" disabled={disabled} onClick={onDelete}>
                Excluir cadastro
              </button>
            </div>
          ) : null}
        </dl>
      ) : null}
    </li>
  );
}
