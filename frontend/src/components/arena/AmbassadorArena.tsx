import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CompetitionGate } from '@/components/arena/CompetitionGate';
import { PlatformMark } from '@/components/brand/PlatformMark';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/contexts/AuthContext';
import {
  ApiError,
  api,
  type ContentItem,
  type MyRankingResponse,
  type PlatformDashboardSlice,
  type RankingCategory,
  type RankingEntry,
  type RankingsResponse,
  type SocialAccount,
  type SocialPlatform,
} from '@/lib/api';
import {
  categoryPhrase,
  firstName,
  formatViews,
  platformLabel,
  profileUrl,
} from '@/lib/format';
import { connectionDuty } from '@/lib/connection';
import { PATENTS, patentFor } from '@/lib/seniority';
import { describeChase } from '@/lib/standing';
import './arena.css';

const PLATFORMS: SocialPlatform[] = ['instagram', 'tiktok'];
const CATEGORIES: RankingCategory[] = ['total_views', 'best_video'];

type BoardKey = `${SocialPlatform}:${RankingCategory}`;

export interface ArenaSnapshot {
  firstName: string;
  accounts: SocialAccount[];
  contents: ContentItem[];
  boards: Partial<Record<BoardKey, RankingsResponse>>;
  standings: Partial<Record<BoardKey, MyRankingResponse>>;
  criteria: string | null;
  slices: PlatformDashboardSlice[];
}

function boardKey(platform: SocialPlatform, category: RankingCategory): BoardKey {
  return `${platform}:${category}`;
}

function entryScore(entry: RankingEntry, category: RankingCategory): number {
  return category === 'total_views' ? entry.totalViews : entry.bestVideoViews;
}

function initial(name: string): string {
  return name.trim().charAt(0).toLocaleUpperCase('pt-BR') || '?';
}

function formatWhen(value: string | null): string {
  if (!value) return 'Indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function AmbassadorArena({ snapshot }: { snapshot?: ArenaSnapshot }) {
  const { profile } = useAuth();
  const locked = snapshot != null;
  const [platform, setPlatform] = useState<SocialPlatform>('instagram');
  const [category, setCategory] = useState<RankingCategory>('total_views');
  const [boards, setBoards] = useState<ArenaSnapshot['boards']>(snapshot?.boards ?? {});
  const [standings, setStandings] = useState<ArenaSnapshot['standings']>(
    snapshot?.standings ?? {},
  );
  const [accounts, setAccounts] = useState<SocialAccount[]>(snapshot?.accounts ?? []);
  const [contents, setContents] = useState<ContentItem[]>(snapshot?.contents ?? []);
  const [slices, setSlices] = useState<PlatformDashboardSlice[]>(snapshot?.slices ?? []);
  const [criteria, setCriteria] = useState<string | null>(snapshot?.criteria ?? null);
  const [errors, setErrors] = useState<Partial<Record<BoardKey, string>>>({});
  const [loading, setLoading] = useState(!locked);
  const [restOpen, setRestOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [videosOpen, setVideosOpen] = useState(false);
  const [extra, setExtra] = useState<Partial<Record<BoardKey, RankingEntry[]>>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [connecting, setConnecting] = useState<SocialPlatform | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [ladderOpen, setLadderOpen] = useState(false);
  const picked = useRef(false);
  const patentRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (locked) return;
    let active = true;

    async function load() {
      const pairs = PLATFORMS.flatMap((itemPlatform) =>
        CATEGORIES.map((itemCategory) => ({
          platform: itemPlatform,
          category: itemCategory,
        })),
      );

      const loaded = await Promise.all(
        pairs.map(async (pair) => {
          const id = boardKey(pair.platform, pair.category);
          try {
            const [board, standing] = await Promise.all([
              api.rankings({
                platform: pair.platform,
                category: pair.category,
                view: 'all',
                page: 1,
                pageSize: 100,
              }),
              api.myRanking({ platform: pair.platform, category: pair.category }),
            ]);
            return { id, board, standing };
          } catch (error) {
            const message =
              error instanceof ApiError
                ? error.message
                : error instanceof Error
                  ? error.message
                  : 'Erro ao carregar ranking.';
            return { id, error: message };
          }
        }),
      );

      if (!active) return;

      const nextBoards: ArenaSnapshot['boards'] = {};
      const nextStandings: ArenaSnapshot['standings'] = {};
      const nextErrors: Partial<Record<BoardKey, string>> = {};
      for (const item of loaded) {
        if ('error' in item && item.error) nextErrors[item.id] = item.error;
        if ('board' in item && item.board) nextBoards[item.id] = item.board;
        if ('standing' in item && item.standing) nextStandings[item.id] = item.standing;
      }
      const [accountResult, contentResult, dashboardResult] = await Promise.allSettled([
        api.socialAccounts(),
        api.contents(),
        api.dashboard(),
      ]);
      if (!active) return;

      setBoards(nextBoards);
      setStandings(nextStandings);
      setErrors(nextErrors);
      if (accountResult.status === 'fulfilled') setAccounts(accountResult.value);
      if (contentResult.status === 'fulfilled') setContents(contentResult.value);
      if (dashboardResult.status === 'fulfilled') {
        setSlices(dashboardResult.value.slices);
        setCriteria(dashboardResult.value.rankingCriteria);
      }
      setConnectError(
        accountResult.status === 'rejected'
          ? 'Não foi possível carregar suas conexões. Recarregue a página para tentar de novo.'
          : null,
      );
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [locked]);

  useEffect(() => {
    if (picked.current || loading) return;
    picked.current = true;
    const instagram = standings[boardKey('instagram', 'total_views')];
    const tiktok = standings[boardKey('tiktok', 'total_views')];
    const instagramPlace = instagram?.position ?? Number.POSITIVE_INFINITY;
    const tiktokPlace = tiktok?.position ?? Number.POSITIVE_INFINITY;
    if (tiktokPlace < instagramPlace) setPlatform('tiktok');
  }, [loading, standings]);

  const activeKey = boardKey(platform, category);
  const board = boards[activeKey];
  const standing = standings[activeKey];
  const name = snapshot?.firstName ?? firstName(profile?.fullName, profile?.publicName);
  const items = useMemo(
    () => [...(board?.items ?? []), ...(extra[activeKey] ?? [])],
    [board?.items, extra, activeKey],
  );

  const standingScore = standing?.score ?? null;
  const me = items.find((item) => item.isCurrentUser);
  const below = me ? items.find((item) => item.position === me.position + 1) : undefined;
  const belowGap =
    me && below ? entryScore(me, category) - entryScore(below, category) : null;
  const chase = describeChase({
    eligible: standing?.eligible ?? false,
    reason: standing?.reason ?? null,
    position: standing?.position ?? null,
    total: standing?.total ?? board?.total ?? 0,
    gapToAbove: standing?.gapToAbove ?? null,
    myScore: standingScore,
    belowGap,
    category,
    platform,
  });
  const totalViewsStanding = standings[boardKey(platform, 'total_views')];
  const patent = patentFor(totalViewsStanding?.score ?? 0);
  const videos = contents
    .filter((item) => !item.excluded && item.platform === platform)
    .sort((a, b) => b.views - a.views)
    .slice(0, 6);
  const slice = slices.find((item) => item.platform === platform);
  const blocked =
    !loading &&
    connectionDuty(accounts.find((account) => account.platform === platform)?.status) !== 'ready';
  const featured = blocked
    ? null
    : videos[0]
    ? {
        title: videos[0].title || 'Sem título',
        views: videos[0].views,
        url: videos[0].url,
        thumbnailUrl: videos[0].thumbnailUrl,
      }
    : slice?.bestVideo
      ? {
          title: slice.bestVideo.title || 'Sem título',
          views: slice.bestVideo.views,
          url: slice.bestVideo.permalink ?? '',
          thumbnailUrl: null,
        }
      : null;
  const topBand = items.filter((item) => item.position >= 4 && item.position <= 10);
  const tail = items.filter((item) => item.position > 10);
  const visibleTail = query.trim()
    ? tail.filter((item) => item.publicName.toLowerCase().includes(query.trim().toLowerCase()))
    : tail;
  const total = board?.total ?? standing?.total ?? 0;
  const youAreInTail = (standing?.position ?? 0) > 10;

  useEffect(() => {
    if (!ladderOpen) return;
    const node = patentRef.current;
    const row = node?.parentElement;
    if (node && row && row.scrollWidth > row.clientWidth + 1) {
      row.scrollTo({ left: Math.max(0, node.offsetLeft - (row.clientWidth - node.offsetWidth) / 2) });
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setLadderOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ladderOpen]);

  useEffect(() => {
    if (!restOpen || !youAreInTail) return;
    document.getElementById('rank-you')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [restOpen, youAreInTail]);

  function selectPlatform(next: SocialPlatform) {
    setPlatform(next);
    setRestOpen(false);
    setQuery('');
  }

  function selectCategory(next: RankingCategory) {
    setCategory(next);
    setRestOpen(false);
    setQuery('');
  }

  async function loadMore() {
    if (!board || locked) return;
    const pageSize = board.pageSize || 100;
    const nextPage = Math.floor(items.length / pageSize) + 1;
    setLoadingMore(true);
    try {
      const page = await api.rankings({
        platform,
        category,
        view: 'all',
        page: nextPage,
        pageSize,
      });
      setExtra((current) => ({
        ...current,
        [activeKey]: [...(current[activeKey] ?? []), ...page.items],
      }));
    } catch {
      setErrors((current) => ({
        ...current,
        [activeKey]: 'Não foi possível carregar mais posições. Tente de novo.',
      }));
    } finally {
      setLoadingMore(false);
    }
  }

  function openVideos() {
    setVideosOpen((open) => !open);
  }

  async function connect(next: SocialPlatform) {
    if (locked) return;
    setConnecting(next);
    setConnectError(null);
    try {
      const { url } = await api.startOAuth(next);
      window.location.href = url;
    } catch (error) {
      setConnectError(
        error instanceof Error ? error.message : 'Não foi possível abrir a conexão.',
      );
      setConnecting(null);
    }
  }

  const placeTone =
    standing?.position != null && standing.position <= 3 ? String(standing.position) : 'rest';

  return (
    <div className="arena">
      <header className="arena-hero">
        <p className="arena-hello">
          Olá, <strong>{name}</strong>
        </p>
        {loading ? (
          <div className="arena-skeleton arena-skeleton-hero" aria-hidden>
            <i />
            <i />
          </div>
        ) : blocked ? null : standing?.eligible && standing.position != null ? (
          <h1 className="arena-standing">
            Você está na{' '}
            <span className="arena-ordinal" data-place={placeTone}>
              {standing.position}
              <sup>ª</sup>
            </span>{' '}
            posição
          </h1>
        ) : (
          <h1 className="arena-standing">Você ainda não está neste ranking</h1>
        )}
        {loading || blocked ? null : (
          <>
            <p className="arena-context">{chase.context}</p>
            <p className="arena-detail">{chase.detail}</p>
            {chase.progress != null ? (
              <div
                className="arena-chase"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(chase.progress * 100)}
                aria-label="Proximidade de quem está acima"
              >
                <span style={{ width: `${Math.max(6, Math.round(chase.progress * 100))}%` }} />
              </div>
            ) : null}
          </>
        )}
      </header>

      {loading ? null : (
        <CompetitionGate
          accounts={accounts}
          busy={connecting}
          onConnect={(next) => void connect(next)}
        />
      )}
      {connectError ? (
        <Alert variant="error" role="alert">
          {connectError}
        </Alert>
      ) : null}

      {featured ? (
        featured.url ? (
          <a className="featured" href={featured.url} target="_blank" rel="noreferrer">
            <FeaturedMedia thumbnailUrl={featured.thumbnailUrl} />
            <div>
              <p>Seu vídeo com mais views</p>
              <strong>{featured.title}</strong>
              <span>{formatViews(featured.views)} views</span>
            </div>
            <span className="featured-open">Abrir vídeo</span>
          </a>
        ) : (
          <article className="featured">
            <FeaturedMedia thumbnailUrl={featured.thumbnailUrl} />
            <div>
              <p>Seu vídeo com mais views</p>
              <strong>{featured.title}</strong>
              <span>{formatViews(featured.views)} views. O link ainda não chegou na sincronização.</span>
            </div>
          </article>
        )
      ) : null}

      <div className="arena-controls">
        <div className="arena-switch" role="tablist" aria-label="Tipo de ranking">
          {CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={category === item}
              onClick={() => selectCategory(item)}
            >
              {item === 'total_views' ? 'Views totais' : 'Vídeo com mais views'}
            </button>
          ))}
        </div>
        <div className="arena-actions">
          {PLATFORMS.map((item) => {
            const account = accounts.find((entry) => entry.platform === item);
            const href = profileUrl(item, account?.username);
            const needsLogin = connectionDuty(account?.status) !== 'ready';
            return (
              <div
                key={item}
                className={clsx('arena-network', platform === item && 'is-on')}
              >
                <button
                  type="button"
                  aria-pressed={platform === item}
                  onClick={() => selectPlatform(item)}
                >
                  <NetworkGlyph platform={item} />
                  {platformLabel(item)}
                </button>
                {href && !needsLogin ? (
                  <a href={href} target="_blank" rel="noreferrer">
                    Abrir
                  </a>
                ) : (
                  <button type="button" className="cta" onClick={() => void connect(item)}>
                    Conectar
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            className="arena-videos-btn"
            aria-expanded={videosOpen}
            aria-controls="videos-mais-acessados"
            onClick={openVideos}
          >
            Vídeos mais acessados
          </button>
        </div>
      </div>

      {videosOpen ? (
        <section id="videos-mais-acessados" aria-label="Vídeos mais acessados">
          {videos.length === 0 ? (
            <EmptyState
              title="Nenhum vídeo sincronizado"
              description="Conecte a rede e aguarde a coleta para ver os vídeos com mais views."
              action={
                <Link className="arena-link" to="/conexoes">
                  Conectar redes
                </Link>
              }
            />
          ) : (
            <div className="arena-videos">
              {videos.map((video) => (
                <a
                  key={video.id}
                  className="arena-video"
                  href={video.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {video.thumbnailUrl ? (
                    <img src={video.thumbnailUrl} alt="" />
                  ) : (
                    <span className="arena-video-fallback" aria-hidden />
                  )}
                  <strong>{video.title || 'Sem título'}</strong>
                  <span>{formatViews(video.views)} views</span>
                </a>
              ))}
              <Link className="arena-link" to="/conteudos">
                Ver todos os conteúdos
              </Link>
            </div>
          )}
        </section>
      ) : null}

      {loading ? (
        <div className="arena-skeleton" aria-hidden>
          <i />
          <i />
          <i />
        </div>
      ) : errors[activeKey] && !board ? (
        <Alert variant="error" role="alert">
          {errors[activeKey]}
        </Alert>
      ) : !board || total === 0 ? (
        <EmptyState
          title="Ranking ainda vazio"
          description={`Quando houver views em ${platformLabel(platform)}, o pódio aparece aqui.`}
        />
      ) : (
        <>
          <section className="podium-wrap" aria-label="Pódio">
            <div className="podium">
              {([2, 1, 3] as const).map((place) => {
                const entry = items.find((item) => item.position === place) ?? null;
                return (
                  <Pedestal
                    key={place}
                    place={place}
                    entry={entry}
                    category={category}
                  />
                );
              })}
            </div>
          </section>

          {topBand.length > 0 ? (
            <section className="rank-block" aria-label="Top 10">
              <h2>Top 10</h2>
              <ol className="rank-list">
                {topBand.map((entry, index) => (
                  <RankRow
                    key={entry.profileId}
                    entry={entry}
                    category={category}
                    delay={index * 40}
                  />
                ))}
              </ol>
            </section>
          ) : null}

          {total > 10 ? (
            <section className="rank-block" aria-label="Restante do ranking">
              <button
                type="button"
                className="rest-toggle"
                aria-expanded={restOpen}
                aria-controls="ranking-restante"
                onClick={() => setRestOpen((open) => !open)}
              >
                <span>
                  {restOpen ? 'Fechar lista' : `Mostrar do 11º ao ${formatViews(total)}º`}
                  {youAreInTail && !restOpen ? (
                    <small> Sua posição está neste trecho.</small>
                  ) : null}
                </span>
                <span aria-hidden>{restOpen ? 'Fechar' : 'Abrir'}</span>
              </button>
              {restOpen ? (
                <div className="rest-panel" id="ranking-restante">
                  <input
                    className="rest-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar embaixador"
                    aria-label="Buscar embaixador"
                  />
                  <ol className="rank-list">
                    {visibleTail.map((entry) => (
                      <RankRow key={entry.profileId} entry={entry} category={category} />
                    ))}
                  </ol>
                  {visibleTail.length === 0 ? (
                    <p className="arena-note">Nenhum embaixador com esse nome neste trecho.</p>
                  ) : null}
                  {!locked && items.length < total ? (
                    <button
                      type="button"
                      className="more-btn"
                      onClick={() => void loadMore()}
                      disabled={loadingMore}
                    >
                      {loadingMore ? 'Carregando' : 'Carregar mais'}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      )}

      <section className="tier" aria-label="Nível">
        <button type="button" className="tier-current" onClick={() => setLadderOpen(true)}>
          <img src={patent.current.image} alt="" />
          <span>
            <small>Seu nível</small>
            <strong>{patent.current.name}</strong>
            <em>
              {patent.next
                ? `Faltam ${formatViews(patent.remaining)} views para ${patent.next.name}.`
                : 'Você chegou ao nível máximo.'}
            </em>
          </span>
        </button>
      </section>
      {ladderOpen ? (
        <div className="tier-layer" role="dialog" aria-modal="true" aria-labelledby="tier-title">
          <button type="button" className="tier-scrim" aria-label="Fechar" onClick={() => setLadderOpen(false)} />
          <div className="tier-sheet">
            <p className="tier-kicker">Guerreiros embaixadores</p>
            <h2 id="tier-title">Progressão de níveis</h2>
            <ol className="tier-row">
              {PATENTS.map((item) => {
                const state =
                  item.level < patent.current.level
                    ? 'is-done'
                    : item.level === patent.current.level
                      ? 'is-now'
                      : 'is-ahead';
                return (
                  <li
                    key={item.level}
                    className={state}
                    data-level={item.level}
                    ref={item.level === patent.current.level ? patentRef : undefined}
                  >
                    <img src={item.image} alt="" />
                    <strong>{item.name}</strong>
                    <span>{item.step}</span>
                    <small>
                      {state === 'is-now'
                        ? 'Você está aqui'
                        : state === 'is-done'
                          ? 'Concluído'
                          : `${formatViews(item.minViews)} views`}
                    </small>
                  </li>
                );
              })}
            </ol>
            <button type="button" className="tier-close" onClick={() => setLadderOpen(false)}>
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      {slice && !blocked ? (
        <p className="arena-note">
          {slice.officialAccountViews == null
            ? `${slice.officialAccountViewsLabel}.`
            : `${slice.officialAccountViewsLabel}: ${formatViews(slice.officialAccountViews)}.`}{' '}
          Última sincronização: {formatWhen(slice.lastSyncAt)}. Agora você vê{' '}
          {categoryPhrase(category)} no {platformLabel(platform)}.
        </p>
      ) : (
        <p className="arena-note">
          Agora você vê {categoryPhrase(category)} no {platformLabel(platform)}.
        </p>
      )}

      {criteria ? (
        <details className="arena-criteria">
          <summary>Como a ordem é definida</summary>
          <p>{criteria}</p>
        </details>
      ) : null}
    </div>
  );
}

function Pedestal({
  place,
  entry,
  category,
}: {
  place: 1 | 2 | 3;
  entry: RankingEntry | null;
  category: RankingCategory;
}) {
  if (!entry) {
    return (
      <article className="pedestal" data-place={place}>
        <div className="column">
          <em>Vaga aberta</em>
        </div>
      </article>
    );
  }

  return (
    <article
      className={clsx('pedestal', entry.isCurrentUser && 'is-you')}
      data-place={place}
      aria-current={entry.isCurrentUser ? 'true' : undefined}
    >
      <div className="pedestal-person">
        <Avatar
          name={entry.publicName}
          url={entry.avatarUrl}
          size={place === 1 ? 'lg' : 'md'}
          views={entry.totalViews}
        />
        <span className="place-coin" aria-label={`${place}º lugar`}>
          <b>{place}</b>
        </span>
      </div>
      <div className="column">
        <p className="pedestal-name">{entry.publicName}</p>
        <strong>{formatViews(entryScore(entry, category))}</strong>
        <span>views</span>
      </div>
    </article>
  );
}

function RankRow({
  entry,
  category,
  delay = 0,
}: {
  entry: RankingEntry;
  category: RankingCategory;
  delay?: number;
}) {
  return (
    <li
      id={entry.isCurrentUser ? 'rank-you' : undefined}
      className={clsx('rank-row', entry.isCurrentUser && 'is-you')}
      style={{ animationDelay: `${delay}ms` }}
      aria-current={entry.isCurrentUser ? 'true' : undefined}
    >
      <span className="rank-pos">{entry.position}</span>
      <Avatar name={entry.publicName} url={entry.avatarUrl} size="sm" views={entry.totalViews} />
      <p className="rank-name">
        <span className="rank-label">{entry.publicName}</span>
        {entry.isCurrentUser ? <span className="rank-you">Você</span> : null}
        {entry.isStale ? <span className="rank-stale">Desatualizado</span> : null}
      </p>
      <p className="rank-score">
        {formatViews(entryScore(entry, category))}
        <small>views</small>
      </p>
    </li>
  );
}

function FeaturedMedia({ thumbnailUrl }: { thumbnailUrl: string | null }) {
  if (thumbnailUrl) return <img src={thumbnailUrl} alt="" />;
  return <span className="featured-fallback" aria-hidden />;
}

function Avatar({
  name,
  url,
  size,
  views,
}: {
  name: string;
  url: string | null;
  size: 'lg' | 'md' | 'sm';
  views: number;
}) {
  const tier = patentFor(views).current;
  return (
    <span className={`avatar-wrap avatar-wrap-${size}`}>
      {url ? (
        <img className={`avatar avatar-${size}`} src={url} alt="" />
      ) : (
        <span className={`avatar avatar-${size}`} aria-hidden>
          {initial(name)}
        </span>
      )}
      <img className="tier-pip" src={tier.image} alt={`Nível ${tier.name}`} />
    </span>
  );
}

function NetworkGlyph({ platform }: { platform: SocialPlatform }) {
  return <PlatformMark platform={platform} size={22} />;
}
