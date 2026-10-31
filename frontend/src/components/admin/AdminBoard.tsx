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

type Pending = { kind: 'adjust' | 'reject'; account: AdminAccount };

export type BoardStatus = 'loading' | 'ready' | 'failed';

function cleanHandle(value: string | null): string | null {
  const clean = (value ?? '').trim().replace(/^@+/, '');
  return clean || null;
}

function handleLabel(account: AdminAccount): string {
  const handle = cleanHandle(account.username);
  return handle ? `@${handle}` : 'Conta sem @';
}

/** "@fulano no Instagram", para recados e avisos. */
function accountPhrase(account: AdminAccount): string {
  return `${handleLabel(account)} no ${platformLabel(account.platform)}`;
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

function firstName(account: AdminAccount): string {
  const source = account.fullName || account.publicName;
  return source.split(' ')[0] || source;
}

function sentence(text: string): string {
  const clean = text.trim();
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function noticeFor(account: AdminAccount, decision: ReviewDecision, note = ''): string {
  const name = firstName(account);
  const phrase = accountPhrase(account);
  switch (decision) {
    case 'approved':
      return `Oi, ${name}! Sua conta ${phrase} foi aprovada e as views dela passam a contar no ranking dos Embaixadores.`;
    case 'changes_requested':
      return `Oi, ${name}! Para a sua conta ${phrase} entrar no ranking dos Embaixadores, falta um ajuste: ${sentence(note)} Depois, toque em "Já ajustei" no app.`;
    case 'rejected':
      return `Oi, ${name}. Sua conta ${phrase} não foi aprovada para o ranking dos Embaixadores: ${sentence(note)}`;
  }
}

/** Mais antigas primeiro onde há decisão a tomar; nas decididas, a decisão mais recente. */
function sortColumn(column: Column, items: AdminAccount[]): AdminAccount[] {
  const decided = (item: AdminAccount) => item.reviewedAt ?? item.connectedAt;
  return [...items].sort((a, b) =>
    column === 'waiting'
      ? a.connectedAt.localeCompare(b.connectedAt)
      : column === 'adjust'
        ? decided(a).localeCompare(decided(b))
        : decided(b).localeCompare(decided(a)),
  );
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<AdminAccount | null>(null);
  const [over, setOver] = useState<Column | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
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
    const groups: Record<Column, AdminAccount[]> = { waiting: [], adjust: [], approved: [], out: [] };
    for (const item of visible) groups[COLUMN_OF[item.reviewStatus]].push(item);
    for (const column of COLUMNS) groups[column.id] = sortColumn(column.id, groups[column.id]);
    return groups;
  }, [visible]);

  function offerWhatsApp(account: AdminAccount, text: string) {
    const digits = waDigits(account.whatsapp);
    setNotice(
      digits
        ? { name: firstName(account), href: `https://wa.me/${digits}?text=${encodeURIComponent(text)}` }
        : null,
    );
  }

  async function decide(account: AdminAccount, decision: ReviewDecision, note?: string) {
    setBusyId(account.accountId);
    try {
      const reviewedAt = new Date().toISOString();
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
      const handle = handleLabel(account);
      const name = firstName(account);
      onMessage(
        decision === 'approved'
          ? `${handle} aprovada. As views dessa conta entram no ranking na próxima atualização e ${name} vê a decisão no app.`
          : decision === 'changes_requested'
            ? `Ajuste pedido para ${handle}. ${name} vê o recado no app.`
            : `${handle} reprovada. A conta fica fora do ranking e ${name} vê o motivo no app.`,
      );
      offerWhatsApp(account, noticeFor(account, decision, note));
      setOpenId(null);
      if (!preview) await onChanged();
    } catch (err) {
      onError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível salvar a decisão. Confira a internet e tente de novo.',
      );
    } finally {
      setBusyId(null);
      setPending(null);
    }
  }

  function move(account: AdminAccount, to: Column) {
    const from = COLUMN_OF[account.reviewStatus];
    if (from === to) return;
    if (!MOVES[from].includes(to)) {
      onError(
        to === 'waiting'
          ? 'Aguardando é só para conta que ainda não teve decisão. Escolha aprovar, pedir ajuste ou reprovar.'
          : 'Essa mudança não existe. Use os botões do cartão.',
      );
      return;
    }
    if (to === 'approved') void decide(account, 'approved');
    else setPending({ kind: to === 'adjust' ? 'adjust' : 'reject', account });
  }

  function onDragStart(event: DragEvent<HTMLLIElement>, account: AdminAccount) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', account.accountId);
    setDragging(account);
  }

  function onDragEnd() {
    setDragging(null);
    setOver(null);
  }

  function onDrop(event: DragEvent<HTMLElement>, to: Column) {
    event.preventDefault();
    const account = dragging;
    setDragging(null);
    setOver(null);
    if (account) move(account, to);
  }

  const draggingFrom = dragging ? COLUMN_OF[dragging.reviewStatus] : null;

  return (
    <section className="admin-panel board-panel" aria-labelledby="board-title">
      <div className="admin-panel-head">
        <h2 id="board-title">Aprovações</h2>
        <p>
          Cada cartão é uma conta de rede. Arraste a conta para a coluna da decisão ou use os
          botões do cartão. Só conta aprovada soma no ranking. Ajuste e reprovação pedem um recado,
          que a pessoa vê no app.
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
                accounts={byColumn[column.id]}
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
                renderCard={(account) => (
                  <AccountCard
                    key={account.accountId}
                    account={account}
                    busy={busyId === account.accountId}
                    disabled={busyId !== null}
                    open={openId === account.accountId}
                    onToggle={() =>
                      setOpenId(openId === account.accountId ? null : account.accountId)
                    }
                    onDragStart={(event) => onDragStart(event, account)}
                    onDragEnd={onDragEnd}
                    onApprove={() => void decide(account, 'approved')}
                    onAdjust={() => setPending({ kind: 'adjust', account })}
                    onReject={() => setPending({ kind: 'reject', account })}
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
            ? `Pedir ajuste em ${pending ? handleLabel(pending.account) : ''}`
            : `Reprovar ${pending ? handleLabel(pending.account) : ''}?`
        }
        description={
          pending?.kind === 'adjust'
            ? `A conta fica fora do ranking até o ajuste. ${pending ? firstName(pending.account) : 'A pessoa'} vê o recado no app e avisa quando terminar.`
            : `A conta fica fora do ranking e ${pending ? firstName(pending.account) : 'a pessoa'} vê o motivo no app. As outras contas dela não mudam. Dá para aprovar depois.`
        }
        confirmLabel={pending?.kind === 'adjust' ? 'Enviar pedido de ajuste' : 'Reprovar conta'}
        tone={pending?.kind === 'adjust' ? 'primary' : 'danger'}
        suggestions={pending?.kind === 'adjust' ? ADJUST_SUGGESTIONS : REJECT_SUGGESTIONS}
        busy={pending !== null && busyId === pending.account.accountId}
        onConfirm={(note) => {
          if (!pending) return;
          void decide(
            pending.account,
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
  accounts,
  searching,
  dropState,
  onDragOver,
  onDragLeave,
  onDrop,
  renderCard,
}: {
  column: (typeof COLUMNS)[number];
  accounts: AdminAccount[];
  searching: boolean;
  dropState: 'open' | 'over' | 'closed' | undefined;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  renderCard: (account: AdminAccount) => ReactElement;
}) {
  const list = useListWindow(accounts.length);
  const titleId = `board-col-${column.id}`;
  const remaining = accounts.length - list.visible;
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
          <span className="board-count">{accounts.length}</span>
        </h3>
        <p>{column.hint}</p>
      </header>
      {dropState === 'over' || dropState === 'open' ? (
        <p className="board-drop-hint" aria-hidden>
          Solte aqui
        </p>
      ) : null}
      {accounts.length === 0 ? (
        <p className="board-empty">
          {searching ? 'Nenhuma conta com essa busca nesta coluna.' : column.empty}
        </p>
      ) : (
        <ol className="board-list">{accounts.slice(list.start, list.end).map(renderCard)}</ol>
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

function AccountCard({
  account,
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
  account: AdminAccount;
  busy: boolean;
  disabled: boolean;
  open: boolean;
  onToggle: () => void;
  onDragStart: (event: DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
  onApprove: () => void;
  onAdjust: () => void;
  onReject: () => void;
}) {
  const column = COLUMN_OF[account.reviewStatus];
  const detailsId = `board-card-${account.accountId.replace(/[^a-z0-9]/gi, '-')}`;
  const digits = waDigits(account.whatsapp);
  const href = account.profileUrl ?? profileUrl(account.platform, account.username);
  const added = formatDay(account.connectedAt);
  const decidedAt = formatDateTime(account.reviewedAt);
  const lastSync = formatDateTime(account.lastSyncAt);
  const showNote = (column === 'adjust' || column === 'out') && account.reviewNote;

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
        {account.membershipStatus === 'suspended' ? (
          <span className="admin-status" data-tone="stop">
            <i />
            Pessoa suspensa
          </span>
        ) : null}
      </div>

      <p className="board-person">{account.fullName || account.publicName}</p>
      <p className="board-meta">
        {viewsLine(account)}
        {added ? ` · Adicionada em ${added}` : ''}
      </p>
      {showNote ? <p className="admin-note">Recado: {account.reviewNote}</p> : null}

      <div className="board-actions">
        {busy ? (
          <span className="board-meta">Salvando...</span>
        ) : column === 'waiting' || column === 'adjust' ? (
          <>
            <button type="button" className="admin-primary" disabled={disabled} onClick={onApprove}>
              Aprovar
            </button>
            {column === 'waiting' ? (
              <button type="button" disabled={disabled} onClick={onAdjust}>
                Pedir ajuste
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
              <a href={`mailto:${account.email}`}>{account.email}</a>
            </dd>
          </div>
          <div>
            <dt>WhatsApp</dt>
            <dd>
              {digits && account.whatsapp ? (
                <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer">
                  {formatPhone(account.whatsapp)}
                </a>
              ) : (
                'Não informado'
              )}
            </dd>
          </div>
          <div>
            <dt>Decisão</dt>
            <dd>
              {decidedAt
                ? `${decidedAt}${account.reviewedByName ? ` por ${account.reviewedByName}` : ''}`
                : 'Ainda sem decisão'}
            </dd>
          </div>
          <div>
            <dt>Última coleta</dt>
            <dd>{lastSync ?? 'Em coleta'}</dd>
          </div>
          {column === 'approved' ? (
            <div className="board-details-foot">
              <button type="button" className="is-stop" disabled={disabled} onClick={onReject}>
                Reprovar conta
              </button>
            </div>
          ) : null}
        </dl>
      ) : null}
    </li>
  );
}
