import { ArrowLeft, ExternalLink, Play } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PlatformMark } from '@/components/brand/PlatformMark';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError, api, type AmbassadorProfile } from '@/lib/api';
import { formatViews, platformLabel, profileUrl } from '@/lib/format';
import { patentFor } from '@/lib/seniority';

const card = 'rounded-[14px] border border-border bg-surface-card p-5';
const backLink =
  'inline-flex min-h-[44px] items-center gap-2 rounded-xl px-1 text-sm font-semibold text-text-muted hover:text-text';

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function shortDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(value));
}

/** Perfil de quem disputa o ranking, aberto a todos os embaixadores para se inspirarem. */
export function AmbassadorProfilePage() {
  const { id = '' } = useParams();
  const { profile: me } = useAuth();
  const [data, setData] = useState<AmbassadorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failedAvatar, setFailedAvatar] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.ambassador(id));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? 'Não encontramos esse embaixador. Ele pode ter saído do programa.'
          : 'Não foi possível abrir o perfil agora. Confira a internet e tente de novo.',
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const back = (
    <Link to="/rankings" className={backLink}>
      <ArrowLeft className="size-4" aria-hidden />
      Voltar para o ranking
    </Link>
  );

  if (loading && !data) {
    return (
      <div className="space-y-4">
        {back}
        <div className="flex justify-center py-16">
          <Spinner label="Abrindo o perfil..." />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        {back}
        <section className={card} role="alert">
          <h1 className="text-lg font-semibold text-text">Perfil indisponível</h1>
          <p className="mt-1 text-sm text-text-muted">{error}</p>
          <Button className="mt-4 min-h-[44px]" variant="secondary" onClick={() => void load()}>
            Tentar de novo
          </Button>
        </section>
      </div>
    );
  }

  const tier = patentFor(data.totalViews).current;
  const isMe = me?.id === data.id;

  return (
    <div className="space-y-4">
      {back}

      <header className={`${card} flex flex-wrap items-center gap-4`}>
        <span className="relative inline-flex">
          {data.avatarUrl && !failedAvatar ? (
            <img
              src={data.avatarUrl}
              alt=""
              className="size-20 rounded-full object-cover"
              onError={() => setFailedAvatar(true)}
            />
          ) : (
            <span
              className="inline-flex size-20 items-center justify-center rounded-full bg-[#0034b8] text-2xl font-semibold text-white"
              aria-hidden
            >
              {initial(data.publicName)}
            </span>
          )}
          <img
            src={tier.image}
            alt={`Nível ${tier.name}`}
            className="absolute -right-2 -top-2 size-9 object-contain"
          />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="page-title break-words">
            {data.publicName}
            {isMe ? <span className="ml-2 align-middle text-sm font-semibold text-text-muted">Você</span> : null}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {data.position
              ? `${data.position}º no ranking geral, entre ${data.participants} embaixadores`
              : 'Ainda fora do ranking geral'}
            {' · '}Nível {tier.name}
          </p>
          <p className="mt-2 text-[28px] font-semibold leading-none tabular-nums text-text">
            {formatViews(data.totalViews)}
            <span className="ml-2 text-sm font-normal text-text-muted">views desde o início</span>
          </p>
        </div>
      </header>

      <section className={card} aria-labelledby="perfil-contas">
        <h2 id="perfil-contas" className="text-lg font-semibold text-text">
          Onde {isMe ? 'você posta' : 'posta'}
        </h2>
        {data.accounts.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">Nenhuma conta aprovada ainda.</p>
        ) : (
          <ul className="mt-3 grid gap-2.5">
            {data.accounts.map((account) => {
              const href = account.profileUrl ?? profileUrl(account.platform, account.username);
              const handle = account.username ? `@${account.username.replace(/^@/, '')}` : 'Conta sem @';
              return (
                <li key={account.id}>
                  <a
                    href={href ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-[56px] items-center gap-3 rounded-xl border border-border px-3 py-2 hover:bg-[var(--accent-soft)]"
                  >
                    <PlatformMark platform={account.platform} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-text">{handle}</span>
                      <span className="block text-sm text-text-muted">
                        {platformLabel(account.platform)} · {formatViews(account.views)} views
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#b9ccff]">
                      Abrir
                      <ExternalLink className="size-4" aria-hidden />
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={card} aria-labelledby="perfil-videos">
        <h2 id="perfil-videos" className="text-lg font-semibold text-text">
          Vídeos que mais renderam
        </h2>
        <p className="mt-1 text-sm text-text-muted">Toque para assistir e se inspirar.</p>
        {data.videos.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">Em coleta. Os vídeos aparecem depois da primeira leitura.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {data.videos.map((video) => (
              <li key={video.id}>
                <a
                  href={video.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="group block overflow-hidden rounded-xl border border-border hover:border-[#7aa2ff]"
                  aria-label={`${video.title || 'Vídeo'}, ${formatViews(video.views)} views no ${platformLabel(video.platform)}`}
                >
                  <span className="relative block aspect-[9/16] bg-[#10182b]">
                    {video.thumbnailUrl ? (
                      <img
                        src={video.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 size-full object-cover"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : null}
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2.5">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
                        <Play className="size-3.5" aria-hidden />
                        {formatViews(video.views)} views
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-white/80">
                        <PlatformMark platform={video.platform} size={14} />
                        {shortDate(video.publishedAt) ?? platformLabel(video.platform)}
                      </span>
                    </span>
                  </span>
                  {video.title ? (
                    <span className="line-clamp-2 block px-2.5 py-2 text-xs text-text-muted">{video.title}</span>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
