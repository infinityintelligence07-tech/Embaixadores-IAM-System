import { PlatformMark } from '@/components/brand/PlatformMark';
import type { SocialAccount, SocialPlatform } from '@/lib/api';
import './arena.css';
import {
  actionLabel,
  connectionDuty,
  dutyLine,
  gateHeadline,
  reviewHeadline,
  reviewLine,
} from '@/lib/connection';
import { platformLabel } from '@/lib/format';

const PLATFORMS: SocialPlatform[] = ['instagram', 'tiktok'];

export function CompetitionGate({
  accounts,
  onConnect,
  onRequestReview,
  busy,
  persist = false,
}: {
  accounts: Pick<
    SocialAccount,
    'id' | 'platform' | 'status' | 'username' | 'reviewStatus' | 'reviewNote'
  >[];
  onConnect: (platform: SocialPlatform) => void;
  /** Embaixador avisa que fez o ajuste pedido; sem callback o botão não aparece. */
  onRequestReview?: (accountId: string) => void;
  busy?: string | null;
  persist?: boolean;
}) {
  const headline = gateHeadline(accounts) ?? reviewHeadline(accounts);
  if (!headline && !persist) return null;

  const title = headline?.title ?? 'Suas redes na competição';
  const detail =
    headline?.detail ??
    'Suas contas estão conectadas e aprovadas. As views entram no ranking por elas.';

  return (
    <section className="gate" aria-label="Conexão para a competição">
      <div>
        <h2>{title}</h2>
        <p className="gate-lead">{detail}</p>
      </div>
      <div className="gate-grid">
        {PLATFORMS.map((platform) => {
          const account = accounts.find((item) => item.platform === platform);
          const duty = connectionDuty(account?.status);
          const label = actionLabel(platform, duty);
          const handle = account?.username?.replace(/^@/, '').trim();
          const review = duty === 'ready' ? reviewLine(account?.reviewStatus, account?.reviewNote) : null;
          const line =
            duty === 'ready' && handle ? `Conectado como @${handle}` : dutyLine(platform, duty);

          return (
            <article
              key={platform}
              className="gate-card"
              data-duty={duty}
              data-review={duty === 'ready' ? account?.reviewStatus : undefined}
            >
              <PlatformMark platform={platform} size={48} />
              <div>
                <strong>{platformLabel(platform)}</strong>
                <p>{line}</p>
                {review ? <p className="gate-review">{review}</p> : null}
                {label ? (
                  <button
                    type="button"
                    className="cta"
                    disabled={busy === platform}
                    onClick={() => onConnect(platform)}
                  >
                    {busy === platform ? 'Abrindo...' : label}
                  </button>
                ) : null}
                {duty === 'ready' &&
                account?.reviewStatus === 'changes_requested' &&
                onRequestReview ? (
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
            </article>
          );
        })}
      </div>
    </section>
  );
}
