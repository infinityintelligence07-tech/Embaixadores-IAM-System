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
  reloadKey = 0,
  onCount,
  onChanged,
  onMessage,
  onError,
}: {
  preview: boolean;
  /** Muda quando outro painel aprova ou reprova alguém, para a lista não ficar velha. */
  reloadKey?: number;
  onCount: (count: number) => void;
  onChanged?: () => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [items, setItems] = useState<AccountReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [asking, setAsking] = useState<{
    item: AccountReviewItem;
    decision: Exclude<ReviewDecision, 'approved'>;
  } | null>(null);
  const [lastNotice, setLastNotice] = useState<{ href: string; name: string } | null>(null);

  const load = useCallback(async () => {
    if (preview) {
      const demo = await import('@/components/admin/previewData');
      setItems(demo.previewAccountReviews);
      setLoading(false);
      return;
    }
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
    if (preview && reloadKey > 0) return;
    void load();
  }, [load, preview, reloadKey]);

  const waiting = items.filter((item) => item.reviewStatus === 'pending');
  const adjusting = items.filter((item) => item.reviewStatus === 'changes_requested');

  useEffect(() => {
    if (!loading) onCount(waiting.length);
  }, [loading, onCount, waiting.length]);

  async function decide(item: AccountReviewItem, decision: ReviewDecision, note = '') {
    setBusyId(item.accountId);
    try {
      if (preview) {
        setItems((current) =>
          decision === 'changes_requested'
            ? current.map((row) =>
                row.accountId === item.accountId
                  ? { ...row, reviewStatus: decision, reviewNote: note }
                  : row,
              )
            : current.filter((row) => row.accountId !== item.accountId),
        );
      } else {
        await api.adminReviewAccount(item.accountId, decision, note || undefined);
      }
      const network = platformLabel(item.platform);
      onMessage(
        decision === 'approved'
          ? `${network} de ${item.publicName} aprovado. Entra no ranking na próxima atualização, em até 10 minutos, e a pessoa recebeu o aviso no app.`
          : decision === 'changes_requested'
            ? `Ajuste pedido para ${item.publicName}. O recado aparece no app.`
            : `${network} de ${item.publicName} reprovado. O motivo aparece no app.`,
      );
      const href = whatsappHref(item, messageFor(item, decision, note));
      setLastNotice(href ? { href, name: item.publicName } : null);
      if (!preview) {
        await load();
        onChanged?.();
      }
    } catch (err) {
      onError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível salvar a decisão. Confira a internet e tente de novo.',
      );
    } finally {
      setBusyId(null);
      setAsking(null);
    }
  }

  function renderItem(item: AccountReviewItem) {
    const busy = busyId === item.accountId;
    const href = profileHref(item);
    const handle = item.username ? `@${item.username.replace(/^@/, '')}` : 'sem @';
    const pending = item.reviewStatus === 'pending';
    return (
      <article key={item.accountId} className="admin-row admin-member">
        <div className="admin-person">
          <strong>
            {item.fullName || item.publicName}
            <span className="admin-status" data-tone={pending ? 'wait' : undefined}>
              <i />
              {pending ? 'Aguardando decisão' : 'Aguardando o ajuste'}
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
            Conta informada em {formatWhen(item.verifiedAt ?? item.connectedAt)}
            {item.membershipStatus === 'pending' ? ' · Cadastro ainda não aprovado' : ''}
          </span>
          {!pending && item.reviewNote ? (
            <span className="admin-note">Recado enviado: {item.reviewNote}</span>
          ) : null}
        </div>
        <div className="admin-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => setAsking({ item, decision: 'changes_requested' })}
          >
            {pending ? 'Pedir ajuste' : 'Mudar o recado'}
          </button>
          <button
            type="button"
            className="is-stop"
            disabled={busy}
            onClick={() => setAsking({ item, decision: 'rejected' })}
          >
            Reprovar
          </button>
          <button
            type="button"
            className="admin-primary"
            disabled={busy}
            onClick={() => void decide(item, 'approved')}
          >
            {busy ? 'Salvando...' : 'Aprovar no ranking'}
          </button>
        </div>
      </article>
    );
  }

  return (
    <section className="admin-panel" aria-labelledby="account-reviews-title">
      <div className="admin-panel-head">
        <h2 id="account-reviews-title">Contas para o ranking</h2>
        <p>
          Cada Instagram ou TikTok informado no cadastro espera a sua decisão. Só conta aprovada
          entra no ranking, e a pessoa recebe o aviso no app.
        </p>
      </div>

      {lastNotice ? (
        <div className="admin-row">
          <span className="admin-meta">Quer avisar {lastNotice.name} no WhatsApp também?</span>
          <div className="admin-actions">
            <button type="button" onClick={() => setLastNotice(null)}>
              Agora não
            </button>
            <a href={lastNotice.href} target="_blank" rel="noreferrer">
              Abrir WhatsApp com o recado
            </a>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="admin-row">
          <Spinner label="Carregando contas..." />
        </div>
      ) : null}
      {failed ? (
        <div className="admin-empty" role="alert">
          <strong>Não foi possível carregar as contas</strong>
          <p>Confira a internet e tente de novo. Se continuar, avise o suporte técnico.</p>
          <div className="admin-actions">
            <button type="button" onClick={() => void load()}>
              Tentar de novo
            </button>
          </div>
        </div>
      ) : null}
      {!loading && !failed && items.length === 0 ? (
        <div className="admin-empty" role="status">
          <strong>Nenhuma conta esperando decisão</strong>
          <p>Quando alguém se cadastrar com o @ de uma rede, a conta aparece aqui.</p>
        </div>
      ) : null}

      {waiting.map(renderItem)}
      {adjusting.length > 0 ? (
        <>
          <h3 className="admin-subhead">
            Esperando o ajuste do embaixador<span>{adjusting.length}</span>
          </h3>
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
        confirmLabel={asking?.decision === 'rejected' ? 'Reprovar conta' : 'Enviar pedido de ajuste'}
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
