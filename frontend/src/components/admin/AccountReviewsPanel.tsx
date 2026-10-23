import { useCallback, useEffect, useState } from 'react';
import { NoteDialog } from '@/components/admin/NoteDialog';
import { Spinner } from '@/components/ui/Spinner';
import { ApiError, api, type AccountReviewItem, type ReviewDecision } from '@/lib/api';
import { platformLabel } from '@/lib/format';

const ADJUST_SUGGESTIONS = [
  'Deixe o perfil público para as views entrarem.',
  'Use o mesmo @ que você informou no cadastro.',
  'Publique os cortes como Reels, não como foto ou carrossel.',
  'Coloque "Embaixador Acorde Sua Mente" na bio.',
];

const REJECT_SUGGESTIONS = [
  'O perfil não publica conteúdo do programa.',
  'Esse @ não é da pessoa que fez o cadastro.',
];

function formatWhen(value: string | null): string {
  if (!value) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function profileHref(item: AccountReviewItem): string | null {
  if (item.profileUrl) return item.profileUrl;
  const handle = item.username?.replace(/^@/, '');
  if (!handle) return null;
  return item.platform === 'instagram'
    ? `https://www.instagram.com/${encodeURIComponent(handle)}/`
    : `https://www.tiktok.com/@${encodeURIComponent(handle)}`;
}

/** Link do WhatsApp com o recado pronto, para a equipe avisar a pessoa também por lá. */
function whatsappHref(item: AccountReviewItem, message: string): string | null {
  if (!item.whatsapp) return null;
  const digits = item.whatsapp.replace(/\D/g, '');
  const full = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}

function messageFor(item: AccountReviewItem, decision: ReviewDecision, note: string): string {
  const name = item.fullName.split(' ')[0] || item.publicName;
  const network = platformLabel(item.platform);
  switch (decision) {
    case 'approved':
      return `Oi, ${name}! Seu ${network} foi aprovado e já entrou no ranking dos Embaixadores.`;
    case 'changes_requested':
      return `Oi, ${name}! Para o seu ${network} entrar no ranking dos Embaixadores, falta um ajuste: ${note} Depois, toque em "Já ajustei" no app.`;
    case 'rejected':
      return `Oi, ${name}. Seu ${network} não entrou na competição dos Embaixadores: ${note}`;
    default: {
      const exhaustive: never = decision;
      return exhaustive;
    }
  }
}

export function AccountReviewsPanel({
  preview,
  onCount,
  onMessage,
  onError,
}: {
  preview: boolean;
  onCount: (count: number) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [items, setItems] = useState<AccountReviewItem[]>([]);
  const [loading, setLoading] = useState(!preview);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [asking, setAsking] = useState<{
    item: AccountReviewItem;
    decision: Exclude<ReviewDecision, 'approved'>;
  } | null>(null);
  const [lastNotice, setLastNotice] = useState<{ href: string; name: string } | null>(null);

  const load = useCallback(async () => {
    if (preview) return;
    try {
      setItems(await api.adminAccountReviews());
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

  const waiting = items.filter((item) => item.reviewStatus === 'pending');
  const adjusting = items.filter((item) => item.reviewStatus === 'changes_requested');

  useEffect(() => {
    if (!loading) onCount(waiting.length);
  }, [loading, onCount, waiting.length]);

  async function decide(item: AccountReviewItem, decision: ReviewDecision, note = '') {
    setBusyId(item.accountId);
    try {
      await api.adminReviewAccount(item.accountId, decision, note || undefined);
      const network = platformLabel(item.platform);
      onMessage(
        decision === 'approved'
          ? `${network} de ${item.publicName} aprovado. Ele entra no ranking na próxima atualização, em até 10 minutos, e recebeu o aviso no app.`
          : decision === 'changes_requested'
            ? `Ajuste pedido para ${item.publicName}. O recado aparece no app dele.`
            : `${network} de ${item.publicName} reprovado. O motivo aparece no app dele.`,
      );
      const href = whatsappHref(item, messageFor(item, decision, note));
      setLastNotice(href ? { href, name: item.publicName } : null);
      await load();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Não foi possível salvar a decisão.');
    } finally {
      setBusyId(null);
      setAsking(null);
    }
  }

  function renderItem(item: AccountReviewItem) {
    const busy = busyId === item.accountId;
    const href = profileHref(item);
    const handle = item.username ? `@${item.username.replace(/^@/, '')}` : 'sem @';
    const confirmed = item.connectionStatus !== 'pending_verification';
    return (
      <article key={item.accountId} className="admin-row admin-member">
        <div className="admin-person">
          <strong>
            {item.fullName || item.publicName}
            <span
              className="admin-status"
              data-tone={item.reviewStatus === 'pending' ? 'wait' : 'stop'}
            >
              <i />
              {item.reviewStatus === 'pending' ? 'Aguardando' : 'Ajuste pedido'}
            </span>
          </strong>
          <span>
            {platformLabel(item.platform)}{' '}
            {href ? (
              <a href={href} target="_blank" rel="noreferrer">
                {handle}
              </a>
            ) : (
              handle
            )}{' '}
            · {item.email}
          </span>
          <span>
            {confirmed
              ? item.verifiedAt
                ? `Confirmou pela bio em ${formatWhen(item.verifiedAt)}`
                : `Conectado em ${formatWhen(item.connectedAt)}`
              : 'Ainda não colocou o código na bio'}
            {item.membershipStatus === 'pending' ? ' · cadastro novo' : ''}
          </span>
          {item.reviewStatus === 'changes_requested' && item.reviewNote ? (
            <span>Recado enviado: {item.reviewNote}</span>
          ) : null}
        </div>
        <div className="admin-actions">
          <button
            type="button"
            className="admin-primary"
            disabled={busy || preview}
            onClick={() => void decide(item, 'approved')}
          >
            Aprovar no ranking
          </button>
          <button
            type="button"
            disabled={busy || preview}
            onClick={() => setAsking({ item, decision: 'changes_requested' })}
          >
            Pedir ajuste
          </button>
          <button
            type="button"
            className="is-stop"
            disabled={busy || preview}
            onClick={() => setAsking({ item, decision: 'rejected' })}
          >
            Reprovar
          </button>
        </div>
      </article>
    );
  }

  return (
    <section className="admin-panel" aria-label="Contas para aprovar no ranking">
      <h2>Contas para aprovar no ranking</h2>
      <p className="admin-row admin-meta">
        Cada Instagram ou TikTok conectado espera a sua decisão. Só conta aprovada entra no
        ranking. A pessoa recebe o aviso no app.
      </p>

      {lastNotice ? (
        <div className="admin-row">
          <span className="admin-meta">Quer avisar {lastNotice.name} no WhatsApp também?</span>
          <a className="admin-more" href={lastNotice.href} target="_blank" rel="noreferrer">
            Abrir WhatsApp com o recado
          </a>
        </div>
      ) : null}

      {loading ? (
        <div className="admin-row">
          <Spinner label="Carregando contas..." />
        </div>
      ) : null}
      {failed ? (
        <div className="admin-row">
          <span className="admin-meta">Não foi possível carregar as contas.</span>
          <button type="button" className="admin-more" onClick={() => void load()}>
            Tentar de novo
          </button>
        </div>
      ) : null}
      {!loading && !failed && items.length === 0 ? (
        <p className="admin-row admin-meta">Nenhuma conta esperando análise agora.</p>
      ) : null}

      {waiting.map(renderItem)}
      {adjusting.length > 0 ? (
        <>
          <h3 className="admin-row admin-subhead">Esperando o ajuste do embaixador</h3>
          {adjusting.map(renderItem)}
        </>
      ) : null}

      <NoteDialog
        open={asking !== null}
        title={
          asking?.decision === 'rejected'
            ? `Reprovar o ${asking ? platformLabel(asking.item.platform) : ''} de ${asking?.item.publicName ?? ''}?`
            : `Pedir ajuste para ${asking?.item.publicName ?? ''}`
        }
        description={
          asking?.decision === 'rejected'
            ? 'A conta fica fora do ranking. A pessoa vê o motivo no app.'
            : 'A conta fica fora do ranking até o ajuste. A pessoa vê o recado no app e avisa quando terminar.'
        }
        confirmLabel={asking?.decision === 'rejected' ? 'Reprovar' : 'Enviar pedido de ajuste'}
        tone={asking?.decision === 'rejected' ? 'danger' : 'primary'}
        suggestions={asking?.decision === 'rejected' ? REJECT_SUGGESTIONS : ADJUST_SUGGESTIONS}
        busy={asking !== null && busyId === asking.item.accountId}
        onConfirm={(note) => {
          if (asking) void decide(asking.item, asking.decision, note);
        }}
        onCancel={() => setAsking(null)}
      />
    </section>
  );
}
