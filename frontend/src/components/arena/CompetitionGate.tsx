import { PlatformMark } from '@/components/brand/PlatformMark';
import type { SocialAccount, SocialPlatform } from '@/lib/api';
import './arena.css';
import { actionLabel, connectionDuty, dutyLine, gateHeadline } from '@/lib/connection';
import { platformLabel } from '@/lib/format';

const PLATFORMS: SocialPlatform[] = ['instagram', 'tiktok'];

export function CompetitionGate({
  accounts,
  onConnect,
  busy,
  persist = false,
}: {
  accounts: Pick<SocialAccount, 'platform' | 'status' | 'username'>[];
  onConnect: (platform: SocialPlatform) => void;
  busy?: SocialPlatform | null;
  persist?: boolean;
}) {
  const headline = gateHeadline(accounts);
  if (!headline && !persist) return null;

  const title = headline?.title ?? 'Suas redes na competição';
  const detail =
    headline?.detail ??
    'Instagram e TikTok estão conectados. As views entram no ranking por essas contas.';

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
          const line =
            duty === 'ready' && handle ? `Conectado como @${handle}` : dutyLine(platform, duty);

          return (
            <article key={platform} className="gate-card" data-duty={duty}>
              <PlatformMark platform={platform} size={48} />
              <div>
                <strong>{platformLabel(platform)}</strong>
                <p>{line}</p>
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
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
