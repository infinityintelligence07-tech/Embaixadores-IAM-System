import { useMemo, useState, type DragEvent, type ReactElement } from 'react';
import { useListWindow } from '@/components/admin/ListWindow';
import { NoteDialog } from '@/components/admin/NoteDialog';
import { PlatformMark } from '@/components/brand/PlatformMark';
import { Spinner } from '@/components/ui/Spinner';
import {
  ApiError,
  api,
  type AccountReviewStatus,
  type AdminAccount,
  type ReviewDecision,
} from '@/lib/api';
import { formatDateTime, formatDay, formatViews, platformLabel, profileUrl } from '@/lib/format';

type Column = 'waiting' | 'adjust' | 'approved' | 'out';

const COLUMN_OF: Record<AccountReviewStatus, Column> = {
  pending: 'waiting',
  changes_requested: 'adjust',
  approved: 'approved',
  rejected: 'out',
};

const COLUMNS: { id: Column; title: string; hint: string; empty: string }[] = [
  {
    id: 'waiting',
    title: 'Aguardando',
    hint: 'Contas novas esperando a sua decisão.',
    empty: 'Nenhuma conta esperando. Quando alguém adicionar uma conta no app, ela aparece aqui.',
  },
  {
    id: 'adjust',
    title: 'Ajuste pedido',
    hint: 'A pessoa viu o recado e avisa no app quando ajustar.',
    empty: 'Nenhum ajuste em aberto.',
  },
  {
    id: 'approved',
    title: 'Aprovadas',
    hint: 'Somando views no ranking.',
    empty: 'Nenhuma conta aprovada ainda. Arraste uma conta para cá.',
  },
  {
    id: 'out',
    title: 'Reprovadas',
    hint: 'Fora do ranking. Dá para aprovar depois.',
    empty: 'Nenhuma conta reprovada.',
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
  'Publique os cortes como Reels, não como foto ou carrossel.',
  'Confira se o @ está escrito certo e adicione a conta de novo.',
];

const REJECT_SUGGESTIONS = [
  'O perfil não publica conteúdo do programa.',
  'Essa conta não é da pessoa que a adicionou.',
];

interface Group {
  key: string;
  column: Column;
  profileId: string;
  person: AdminAccount;
  accounts: AdminAccount[];
}

type Pending = { kind: 'adjust' | 'reject'; group: Group; accounts: AdminAccount[] };

export type BoardStatus = 'loading' | 'ready' | 'failed';

function cleanHandle(value: string | null): string | null {
  const clean = (value ?? '').trim().replace(/^@+/, '');
  return clean || null;
}

function handleLabel(account: AdminAccount): string {
  const handle = cleanHandle(account.username);
  return handle ? `@${handle}` : 'Conta sem @';
}

/** "@fulano no Instagram e @ciclano no TikTok", para recados e avisos. */
function accountsPhrase(accounts: AdminAccount[]): string {
  const parts = accounts.map((item) => `${handleLabel(item)} no ${platformLabel(item.platform)}`);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

function handlesPhrase(accounts: AdminAccount[]): string {
  const parts = accounts.map(handleLabel);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

function viewsLine(account: AdminAccount): string {
  if (account.views === 0 && !account.lastSyncAt) return 'Em coleta';
  return account.views === 1 ? '1 view' : `${formatViews(account.views)} views`;
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

function personName(account: AdminAccount): string {
  return account.fullName || account.publicName;
}

function firstName(account: AdminAccount): string {
  const source = personName(account);
  return source.split(' ')[0] || source;
}

function sentence(text: string): string {
  const clean = text.trim();
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function noticeFor(accounts: AdminAccount[], decision: ReviewDecision, note = ''): string {
  const name = firstName(accounts[0]);
  const phrase = accountsPhrase(accounts);
  const many = accounts.length > 1;
  switch (decision) {
    case 'approved':
      return many
        ? `Oi, ${name}! Suas contas ${phrase} foram aprovadas e as views delas passam a contar no ranking dos Embaixadores.`
        : `Oi, ${name}! Sua conta ${phrase} foi aprovada e as views dela passam a contar no ranking dos Embaixadores.`;
    case 'changes_requested':
      return `Oi, ${name}! Para ${many ? 'suas contas' : 'sua conta'} ${phrase} entrar no ranking dos Embaixadores, falta um ajuste: ${sentence(note)} Depois, toque em "Já ajustei" no app.`;
    case 'rejected':
      return `Oi, ${name}. ${many ? 'Suas contas' : 'Sua conta'} ${phrase} não ${many ? 'foram aprovadas' : 'foi aprovada'} para o ranking dos Embaixadores: ${sentence(note)}`;
  }
}

/** Uma pessoa vira um cartão por coluna, com as contas dela que estão naquela situação. */
function groupColumn(column: Column, items: AdminAccount[]): Group[] {
  const byPerson = new Map<string, AdminAccount[]>();
  for (const item of items) byPerson.set(item.profileId, [...(byPerson.get(item.profileId) ?? []), item]);
  const decided = (item: AdminAccount) => item.reviewedAt ?? item.connectedAt;
  const groups = [...byPerson.entries()].map(([profileId, accounts]) => {
    const sorted = [...accounts].sort(
      (a, b) => a.platform.localeCompare(b.platform) || a.connectedAt.localeCompare(b.connectedAt),
    );
    const anchor =
      column === 'waiting'
        ? sorted.map((item) => item.connectedAt).sort()[0]
        : sorted.map(decided).sort().reverse()[0];
    return { key: `${column}:${profileId}`, column, profileId, person: sorted[0], accounts: sorted, anchor };
  });
  // Quem espera há mais tempo vem primeiro; nas colunas decididas, a decisão mais recente.
  groups.sort((a, b) =>
    column === 'waiting' || column === 'adjust'
      ? a.anchor.localeCompare(b.anchor)
      : b.anchor.localeCompare(a.anchor),
  );
  return groups.map(({ anchor: _anchor, ...group }) => group);
}

export function AdminBoard({
  accounts,
  status,
  preview,
  onRetry,
  onUpdate,
  onChanged,
  onMessage,
  onError,
}: {
  accounts: AdminAccount[];
  status: BoardStatus;
  preview: boolean;
  onRetry: () => void;
  /** Aplica a decisão na lista da página antes da próxima leitura do servidor. */
  onUpdate: (accountId: string, patch: Partial<AdminAccount>) => void;
  /** Relê as contas depois de uma decisão. */
  onChanged: () => Promise<void> | void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Group | null>(null);
  const [over, setOver] = useState<Column | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<{ name: string; href: string } | null>(null);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase().replace(/^@/, '');
    if (!term) return accounts;
    return accounts.filter(
      (item) =>
        item.fullName.toLowerCase().includes(term) ||
        item.publicName.toLowerCase().includes(term) ||
        item.email.toLowerCase().includes(term) ||
        (cleanHandle(item.username) ?? '').toLowerCase().includes(term),
    );
  }, [accounts, query]);

  const byColumn = useMemo(() => {
    const raw: Record<Column, AdminAccount[]> = { waiting: [], adjust: [], approved: [], out: [] };
    for (const item of visible) raw[COLUMN_OF[item.reviewStatus]].push(item);
    const groups = {} as Record<Column, Group[]>;
    for (const column of COLUMNS) groups[column.id] = groupColumn(column.id, raw[column.id]);
    return groups;
  }, [visible]);

  function offerWhatsApp(list: AdminAccount[], text: string) {
    const digits = waDigits(list[0].whatsapp);
    setNotice(
      digits
        ? { name: firstName(list[0]), href: `https://wa.me/${digits}?text=${encodeURIComponent(text)}` }
        : null,
    );
  }

  async function decide(
    group: Group,
    list: AdminAccount[],
    decision: ReviewDecision,
    note?: string,
  ) {
    setBusyKey(group.key);
    let done: AdminAccount[] = [];
    try {
      const reviewedAt = new Date().toISOString();
      for (const account of list) {
        if (preview) {
          onUpdate(account.accountId, {
            reviewStatus: decision,
            reviewNote: decision === 'approved' ? null : (note ?? null),
            reviewedAt,
            reviewedByName: 'Você',
          });
        } else {
          const result = await api.adminReviewAccount(account.accountId, decision, note);
          onUpdate(account.accountId, {
            reviewStatus: result.reviewStatus,
            reviewNote: result.reviewNote,
            reviewedAt,
          });
        }
        done = [...done, account];
      }
      const handles = handlesPhrase(list);
      const name = firstName(list[0]);
      const many = list.length > 1;
      onMessage(
        decision === 'approved'
          ? `${handles} ${many ? 'aprovadas' : 'aprovada'}. As views entram no ranking na próxima atualização e ${name} vê a decisão no app.`
          : decision === 'changes_requested'
            ? `Ajuste pedido para ${handles}. ${name} vê o recado no app.`
            : `${handles} ${many ? 'reprovadas' : 'reprovada'}. ${many ? 'As contas ficam' : 'A conta fica'} fora do ranking e ${name} vê o motivo no app.`,
      );
      offerWhatsApp(list, noticeFor(list, decision, note));
      setOpenKey(null);
      if (!preview) await onChanged();
    } catch (err) {
      const partial =
        done.length > 0 ? ` Já ${done.length === 1 ? 'foi salva' : 'foram salvas'}: ${handlesPhrase(done)}.` : '';
      onError(
        (err instanceof ApiError
          ? err.message
          : 'Não foi possível salvar a decisão. Confira a internet e tente de novo.') + partial,
      );
      if (!preview && done.length > 0) await onChanged();
    } finally {
      setBusyKey(null);
      setPending(null);
    }
  }

  function move(group: Group, to: Column) {
    if (group.column === to) return;
    if (!MOVES[group.column].includes(to)) {
      onError(
        to === 'waiting'
          ? 'Aguardando é só para conta que ainda não teve decisão. Escolha aprovar, pedir ajuste ou reprovar.'
          : 'Essa mudança não existe. Use os botões do cartão.',
      );
      return;
    }
    if (to === 'approved') void decide(group, group.accounts, 'approved');
    else setPending({ kind: to === 'adjust' ? 'adjust' : 'reject', group, accounts: group.accounts });
  }

  function onDragStart(event: DragEvent<HTMLLIElement>, group: Group) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', group.key);
    setDragging(group);
  }

  function onDragEnd() {
    setDragging(null);
    setOver(null);
  }

  function onDrop(event: DragEvent<HTMLElement>, to: Column) {
    event.preventDefault();
    const group = dragging;
    setDragging(null);
    setOver(null);
    if (group) move(group, to);
  }

  const draggingFrom = dragging?.column ?? null;
  const pendingMany = (pending?.accounts.length ?? 0) > 1;
  const pendingName = pending ? firstName(pending.group.person) : 'A pessoa';

  return (
    <section className="admin-panel board-panel" aria-labelledby="board-title">
      <div className="admin-panel-head">
        <h2 id="board-title">Aprovações</h2>
        <p>
          Cada cartão é uma pessoa, com as contas dela que estão naquela situação. Decida conta por
          conta dentro do cartão, ou arraste o cartão para decidir todas de uma vez. Só conta
          aprovada soma no ranking. Ajuste e reprovação pedem um recado, que a pessoa vê no app.
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

      {status === 'loading' ? (
        <div className="admin-row">
          <Spinner label="Carregando contas..." />
        </div>
      ) : status === 'failed' ? (
        <div className="admin-empty" role="alert">
          <strong>Não foi possível carregar as contas</strong>
          <p>Confira a internet e tente de novo. Se continuar, avise o suporte técnico.</p>
          <div className="admin-actions">
            <button type="button" onClick={onRetry}>
              Tentar de novo
            </button>
          </div>
        </div>
      ) : (
        <div className="board" data-dragging={dragging ? 'true' : undefined}>
          {COLUMNS.map((column) => {
            const allowed = draggingFrom ? MOVES[draggingFrom].includes(column.id) : false;
            return (
              <BoardColumn
                key={column.id}
                column={column}
                groups={byColumn[column.id]}
                searching={query.trim() !== ''}
                dropState={
                  !draggingFrom || draggingFrom === column.id
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
                renderCard={(group) => (
                  <PersonCard
                    key={group.key}
                    group={group}
                    busy={busyKey === group.key}
                    disabled={busyKey !== null}
                    open={openKey === group.key}
                    onToggle={() => setOpenKey(openKey === group.key ? null : group.key)}
                    onDragStart={(event) => onDragStart(event, group)}
                    onDragEnd={onDragEnd}
                    onApprove={(list) => void decide(group, list, 'approved')}
                    onAdjust={(list) => setPending({ kind: 'adjust', group, accounts: list })}
                    onReject={(list) => setPending({ kind: 'reject', group, accounts: list })}
                  />
                )}
              />
            );
          })}
        </div>
      )}

      <NoteDialog
        open={pending !== null}
        title={
          pending?.kind === 'adjust'
            ? `Pedir ajuste em ${pending ? handlesPhrase(pending.accounts) : ''}`
            : `Reprovar ${pending ? handlesPhrase(pending.accounts) : ''}?`
        }
        description={
          pending?.kind === 'adjust'
            ? `${pendingMany ? 'As contas ficam' : 'A conta fica'} fora do ranking até o ajuste. ${pendingName} vê o recado no app e avisa quando terminar.`
            : `${pendingMany ? 'As contas ficam' : 'A conta fica'} fora do ranking e ${pendingName} vê o motivo no app. As outras contas dela não mudam. Dá para aprovar depois.`
        }
        confirmLabel={
          pending?.kind === 'adjust'
            ? 'Enviar pedido de ajuste'
            : pendingMany
              ? 'Reprovar contas'
              : 'Reprovar conta'
        }
        tone={pending?.kind === 'adjust' ? 'primary' : 'danger'}
        suggestions={pending?.kind === 'adjust' ? ADJUST_SUGGESTIONS : REJECT_SUGGESTIONS}
        busy={pending !== null && busyKey === pending.group.key}
        onConfirm={(note) => {
          if (!pending) return;
          void decide(
            pending.group,
            pending.accounts,
            pending.kind === 'adjust' ? 'changes_requested' : 'rejected',
            note,
          );
        }}
        onCancel={() => setPending(null)}
      />
    </section>
  );
}

function BoardColumn({
  column,
  groups,
  searching,
  dropState,
  onDragOver,
  onDragLeave,
  onDrop,
  renderCard,
}: {
  column: (typeof COLUMNS)[number];
  groups: Group[];
  searching: boolean;
  dropState: 'open' | 'over' | 'closed' | undefined;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  renderCard: (group: Group) => ReactElement;
}) {
  const list = useListWindow(groups.length);
  const titleId = `board-col-${column.id}`;
  const remaining = groups.length - list.visible;
  const accountCount = groups.reduce((sum, group) => sum + group.accounts.length, 0);
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
          <span
            className="board-count"
            aria-label={`${accountCount} ${accountCount === 1 ? 'conta' : 'contas'}`}
          >
            {accountCount}
          </span>
        </h3>
        <p>{column.hint}</p>
        {groups.length > 0 ? (
          <p className="board-col-sum">
            {accountCount === 1 ? '1 conta' : `${accountCount} contas`} de{' '}
            {groups.length === 1 ? '1 pessoa' : `${groups.length} pessoas`}
          </p>
        ) : null}
      </header>
      {dropState === 'over' || dropState === 'open' ? (
        <p className="board-drop-hint" aria-hidden>
          Solte aqui para decidir todas as contas do cartão
        </p>
      ) : null}
      {groups.length === 0 ? (
        <p className="board-empty">
          {searching ? 'Ninguém com essa busca nesta coluna.' : column.empty}
        </p>
      ) : (
        <ol className="board-list">{groups.slice(list.start, list.end).map(renderCard)}</ol>
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
  group,
  busy,
  disabled,
  open,
  onToggle,
  onDragStart,
  onDragEnd,
  onApprove,
  onAdjust,
  onReject,
}: {
  group: Group;
  busy: boolean;
  disabled: boolean;
  open: boolean;
  onToggle: () => void;
  onDragStart: (event: DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
  onApprove: (accounts: AdminAccount[]) => void;
  onAdjust: (accounts: AdminAccount[]) => void;
  onReject: (accounts: AdminAccount[]) => void;
}) {
  const { column, person, accounts } = group;
  const detailsId = `board-card-${group.key.replace(/[^a-z0-9]/gi, '-')}`;
  const digits = waDigits(person.whatsapp);
  const many = accounts.length > 1;

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
        <strong>{personName(person)}</strong>
        {person.membershipStatus === 'suspended' ? (
          <span className="admin-status" data-tone="stop">
            <i />
            Pessoa suspensa
          </span>
        ) : null}
      </div>
      <p className="board-meta">
        {many ? `${accounts.length} contas` : '1 conta'}
        {column === 'waiting' ? ' esperando decisão' : ''}
      </p>

      <ul className="board-accounts">
        {accounts.map((account) => (
          <AccountRow
            key={account.accountId}
            account={account}
            column={column}
            disabled={disabled}
            onApprove={() => onApprove([account])}
            onAdjust={() => onAdjust([account])}
            onReject={() => onReject([account])}
          />
        ))}
      </ul>

      <div className="board-actions">
        {busy ? (
          <span className="board-meta">Salvando...</span>
        ) : many && (column === 'waiting' || column === 'adjust' || column === 'out') ? (
          <button
            type="button"
            className="admin-primary"
            disabled={disabled}
            onClick={() => onApprove(accounts)}
          >
            Aprovar todas ({accounts.length})
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
          {accounts.map((account) => {
            const decidedAt = formatDateTime(account.reviewedAt);
            const lastSync = formatDateTime(account.lastSyncAt);
            return (
              <div key={account.accountId}>
                <dt>{handleLabel(account)}</dt>
                <dd>
                  {decidedAt
                    ? `Decisão em ${decidedAt}${account.reviewedByName ? ` por ${account.reviewedByName}` : ''}`
                    : 'Ainda sem decisão'}
                  {`. Última coleta: ${lastSync ?? 'em coleta'}.`}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}
    </li>
  );
}

function AccountRow({
  account,
  column,
  disabled,
  onApprove,
  onAdjust,
  onReject,
}: {
  account: AdminAccount;
  column: Column;
  disabled: boolean;
  onApprove: () => void;
  onAdjust: () => void;
  onReject: () => void;
}) {
  const href = account.profileUrl ?? profileUrl(account.platform, account.username);
  const added = formatDay(account.connectedAt);
  const showNote = (column === 'adjust' || column === 'out') && account.reviewNote;
  return (
    <li className="board-account">
      <div className="board-account-head">
        <PlatformMark platform={account.platform} size={18} />
        <strong className="board-handle">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              aria-label={`${handleLabel(account)} no ${platformLabel(account.platform)}, abre o perfil`}
            >
              {handleLabel(account)}
            </a>
          ) : (
            handleLabel(account)
          )}
        </strong>
      </div>
      <p className="board-meta">
        {viewsLine(account)}
        {added ? ` · Adicionada em ${added}` : ''}
      </p>
      {showNote ? <p className="admin-note">Recado: {account.reviewNote}</p> : null}
      <div className="board-account-actions">
        {column === 'waiting' || column === 'adjust' ? (
          <>
            <button type="button" className="admin-primary" disabled={disabled} onClick={onApprove}>
              Aprovar
            </button>
            {column === 'waiting' ? (
              <button type="button" disabled={disabled} onClick={onAdjust}>
                Ajuste
              </button>
            ) : null}
            <button type="button" className="is-stop" disabled={disabled} onClick={onReject}>
              Reprovar
            </button>
          </>
        ) : column === 'out' ? (
          <button type="button" className="admin-primary" disabled={disabled} onClick={onApprove}>
            Aprovar mesmo assim
          </button>
        ) : (
          <button type="button" className="is-stop" disabled={disabled} onClick={onReject}>
            Reprovar
          </button>
        )}
      </div>
    </li>
  );
}
