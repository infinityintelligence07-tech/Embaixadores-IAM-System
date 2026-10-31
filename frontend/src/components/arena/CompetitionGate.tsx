import { Link } from 'react-router-dom';
import { PlatformMark } from '@/components/brand/PlatformMark';
import type { SocialAccount } from '@/lib/api';
import './arena.css';
import {
  MAX_ACCOUNTS_PER_PLATFORM,
  PLATFORMS,
  gateState,
  handleOf,
  reviewLine,
} from '@/lib/connection';
import { platformLabel } from '@/lib/format';

type GateAccount = Pick<
  SocialAccount,
  'id' | 'platform' | 'status' | 'username' | 'reviewStatus' | 'reviewNote'
>;

/** Guia o que falta para entrar no ranking: a primeira conta, a aprovação ou um ajuste. */
export function CompetitionGate({
  accounts,
  onRequestReview,
  busy,
}: {
  accounts: GateAccount[];
  /** Embaixador avisa que fez o ajuste pedido; sem callback o botão não aparece. */
  onRequestReview?: (accountId: string) => void;
  busy?: string | null;
}) {
  const state = gateState(accounts);
  if (!state) return null;

  if (state.kind === 'empty') {
    return (
      <section className="gate" aria-labelledby="gate-title">
        <div>
          <h2 id="gate-title">Adicione a sua primeira conta</h2>
          <p className="gate-lead">
            Informe o @ do Instagram ou do TikTok onde você posta. A equipe confere o perfil e,
            depois de aprovada, a conta passa a somar no ranking. Você pode ter até{' '}
            {MAX_ACCOUNTS_PER_PLATFORM} contas em cada rede.
          </p>
        </div>
        <div className="gate-grid">
          {PLATFORMS.map((platform) => (
            <article key={platform} className="gate-card">
              <PlatformMark platform={platform} size={48} />
              <div>
                <strong>{platformLabel(platform)}</strong>
                <p>Não pedimos senha, só o @ do perfil público.</p>
                <Link className="cta" to={`/conexoes?adicionar=${platform}`}>
                  Adicionar conta do {platformLabel(platform)}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  const copy =
    state.kind === 'adjust'
      ? {
          title: 'A equipe pediu um ajuste',
          lead: 'Veja o recado, ajuste o perfil e toque em "Já ajustei". A conta volta para a equipe conferir.',
        }
      : state.kind === 'waiting'
        ? {
            title: 'A equipe está conferindo suas contas',
            lead: state.anyApproved
              ? 'Suas contas aprovadas já somam no ranking. As novas entram assim que forem aprovadas, e você recebe um aviso aqui.'
              : 'Assim que uma conta for aprovada, as views dela passam a somar no ranking. Você recebe um aviso aqui.',
          }
        : {
            title: 'Nenhuma conta aprovada',
            lead: 'Veja o motivo abaixo. Você pode adicionar outra conta em Conexões.',
          };

  return (
    <section className="gate" aria-labelledby="gate-title">
      <div>
        <h2 id="gate-title">{copy.title}</h2>
        <p className="gate-lead">{copy.lead}</p>
      </div>
      <ul className="gate-grid gate-list">
        {state.accounts.map((account) => (
          <li key={account.id} className="gate-card" data-review={account.reviewStatus}>
            <PlatformMark platform={account.platform} size={48} />
            <div>
              <strong>{handleOf(account.username) ?? platformLabel(account.platform)}</strong>
              <p className="gate-review">{reviewLine(account.reviewStatus, account.reviewNote)}</p>
              {account.reviewStatus === 'changes_requested' && onRequestReview ? (
                <button
                  type="button"
                  className="cta"
                  disabled={busy === account.id}
                  onClick={() => onRequestReview(account.id)}
                >
                  {busy === account.id ? 'Enviando...' : 'Já ajustei'}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {state.kind === 'adjust' ? null : (
        <Link className="arena-link gate-more" to="/conexoes">
          {state.kind === 'rejected' ? 'Adicionar outra conta' : 'Ver minhas contas'}
        </Link>
      )}
    </section>
  );
}
