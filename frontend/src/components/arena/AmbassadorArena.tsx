import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CompetitionGate } from '@/components/arena/CompetitionGate';
import { GrowthCard } from '@/components/arena/GrowthCard';
import { CompleteSignupCard } from '@/components/arena/CompleteSignupCard';
import { SocialHandleDialog } from '@/components/social/SocialHandleDialog';
import { PlatformMark } from '@/components/brand/PlatformMark';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/contexts/AuthContext';
import {
  ApiError,
  GENERAL_RANKING,
  api,
  type Campaign,
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
  firstName,
  formatViews,
  platformLabel,
  profileUrl,
} from '@/lib/format';
import { connectionDuty } from '@/lib/connection';
import { ABANDONED_OAUTH_HINT, markOAuthStarted, readAbandonedOAuth } from '@/lib/oauth-return';
import { PATENTS, patentFor } from '@/lib/seniority';
import { describeChase } from '@/lib/standing';
import './arena.css';

const PLATFORMS: SocialPlatform[] = ['instagram', 'tiktok'];
const CATEGORIES: RankingCategory[] = ['total_views', 'best_video'];
/** Acima de 30 posições o restante vira páginas; até 30 abre inteiro. */
const TAIL_PAGE = 20;

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
  if (!value) return 'Sem dados';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

/** "2026-10-31" vira "31/10", sem passar por fuso horário. */
function shortDay(day: string): string {
  const [, month, date] = day.split('-');
  return `${date}/${month}`;
}

function campaignLine(campaign: Campaign | undefined): string {
  if (!campaign) return 'Todos os vídeos desde o início do programa.';
  const period = `${shortDay(campaign.firstDay)} a ${shortDay(campaign.lastDay)}`;
  return campaign.state === 'finished'
    ? `Encerrado. Contou as views ganhas de ${period}, de qualquer vídeo.`
    : `Contam as views ganhas de ${period}, de qualquer vídeo, mesmo postado antes.`;
}

export function AmbassadorArena({ snapshot }: { snapshot?: ArenaSnapshot }) {
  const { profile, refreshProfile } = useAuth();
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
  const [tailPage, setTailPage] = useState(0);
  const [query, setQuery] = useState('');
  const [videosOpen, setVideosOpen] = useState(false);
  const [extra, setExtra] = useState<Partial<Record<BoardKey, RankingEntry[]>>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [connecting, setConnecting] = useState<SocialPlatform | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [handlePlatform, setHandlePlatform] = useState<SocialPlatform | null>(null);
  const [handleSuggestion, setHandleSuggestion] = useState<string | null>(null);
  const [abandoned] = useState(() => (locked ? null : readAbandonedOAuth()));
  const [ladderOpen, setLadderOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaign, setCampaign] = useState<string | null>(locked ? GENERAL_RANKING : null);
  const [requestBusy, setRequestBusy] = useState<string | null>(null);
  const picked = useRef(false);
  const patentRef = useRef<HTMLLIElement | null>(null);
  const ladderRef = useRef<HTMLDialogElement | null>(null);
  const tierTitleRef = useRef<HTMLHeadingElement | null>(null);

  const retry = useCallback(() => {
    setLoading(true);
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    if (locked) return;
    let active = true;
    api
      .rankingCampaigns()
      .then((result) => {
        if (!active) return;
        setCampaigns(result.items);
        setCampaign(result.defaultId);
      })
      .catch(() => {
        if (active) setCampaign(GENERAL_RANKING);
      });
    return () => {
      active = false;
    };
  }, [locked]);

  useEffect(() => {
    if (locked || campaign === null) return;
    const selected = campaign;
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
                campaign: selected,
              }),
              api.myRanking({
                platform: pair.platform,
                category: pair.category,
                campaign: selected,
              }),
            ]);
            return { id, board, standing };
          } catch (error) {
            const message =
              error instanceof ApiError
                ? error.message
                : error instanceof Error
                  ? error.message
                  : 'Não foi possível carregar o ranking. Tente de novo.';
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
        api.contents(selected === GENERAL_RANKING ? undefined : selected),
        api.dashboard(),
      ]);
      if (!active) return;

      setBoards(nextBoards);
      setStandings(nextStandings);
      setErrors(nextErrors);
      setExtra({});
      if (accountResult.status === 'fulfilled') setAccounts(accountResult.value);
      if (contentResult.status === 'fulfilled') setContents(contentResult.value);
      if (dashboardResult.status === 'fulfilled') {
        setSlices(dashboardResult.value.slices);
        setCriteria(dashboardResult.value.rankingCriteria);
      }
      setConnectError(
        accountResult.status === 'rejected'
          ? 'Não foi possível carregar suas conexões.'
          : null,
      );
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [locked, attempt, campaign]);

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
  const total = board?.total ?? standing?.total ?? 0;
  const me = items.find((item) => item.isCurrentUser);
  const below = me ? items.find((item) => item.position === me.position + 1) : undefined;
  const belowGap =
    me && below ? entryScore(me, category) - entryScore(below, category) : null;
  const chase = describeChase({
    eligible: standing?.eligible ?? false,
    reason: standing?.reason ?? null,
    position: standing?.position ?? null,
    total,
    gapToAbove: standing?.gapToAbove ?? null,
    myScore: standingScore,
    belowGap,
    category,
    platform,
  });
  const activeCampaign = campaigns.find((item) => item.id === campaign);
  const general = campaign === GENERAL_RANKING;
  const videos = contents
    .filter((item) => !item.excluded && item.platform === platform)
    .sort((a, b) => b.views - a.views)
    .slice(0, 6);
  const slice = slices.find((item) => item.platform === platform);
  // O nível acompanha a carreira inteira: não volta ao primeiro quando um mês novo começa.
  const lifetimeViews =
    slice?.monitoredViewsTotal ??
    (general ? standings[boardKey(platform, 'total_views')]?.score ?? 0 : 0);
  const patent = patentFor(lifetimeViews);
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
    : !activeCampaign && slice?.bestVideo
      ? {
          title: slice.bestVideo.title || 'Sem título',
          views: slice.bestVideo.views,
          url: slice.bestVideo.permalink ?? '',
          thumbnailUrl: null,
        }
      : null;
  const featuredLabel = activeCampaign
    ? `Seu vídeo com mais views em ${periodName(activeCampaign)}`
    : 'Seu vídeo com mais views desde o início';
  const topBand = items.filter((item) => item.position >= 4 && item.position <= 10);
  const tail = items.filter((item) => item.position > 10);
  const visibleTail = query.trim()
    ? tail.filter((item) => item.publicName.toLowerCase().includes(query.trim().toLowerCase()))
    : tail;
  const youAreInTail = (standing?.position ?? 0) > 10;
  const paged = total > 30;
  const tailSize = query.trim() ? visibleTail.length : Math.max(0, total - 10);
  const tailPages = Math.max(1, Math.ceil(tailSize / TAIL_PAGE));
  const shownTail = paged
    ? visibleTail.slice(tailPage * TAIL_PAGE, (tailPage + 1) * TAIL_PAGE)
    : visibleTail;
  // O perfil chega antes do ranking: o cartão de cadastro aparece na hora, sem empurrar a tela depois.
  const needsSignup = !locked && Boolean(profile?.needsSignupDetails);

  useEffect(() => {
    const dialog = ladderRef.current;
    if (!dialog) return;
    if (ladderOpen && !dialog.open) {
      dialog.showModal();
      tierTitleRef.current?.focus({ preventScroll: true });
    } else if (!ladderOpen && dialog.open) {
      dialog.close();
    }
    if (!ladderOpen) return;
    const node = patentRef.current;
    const row = node?.parentElement;
    if (node && row && row.scrollWidth > row.clientWidth + 1) {
      row.scrollTo({ left: Math.max(0, node.offsetLeft - (row.clientWidth - node.offsetWidth) / 2) });
    }
  }, [ladderOpen]);

  useEffect(() => {
    if (!restOpen || !youAreInTail) return;
    document.getElementById('rank-you')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [restOpen, youAreInTail]);

  function selectPlatform(next: SocialPlatform) {
    setPlatform(next);
    setRestOpen(false);
    setTailPage(0);
    setQuery('');
  }

  function selectCategory(next: RankingCategory) {
    setCategory(next);
    setRestOpen(false);
    setTailPage(0);
    setQuery('');
  }

  function toggleRest() {
    if (!restOpen && paged && youAreInTail && standing?.position != null) {
      const yours = Math.floor((standing.position - 11) / TAIL_PAGE);
      setTailPage(tail.some((item) => item.isCurrentUser) ? yours : 0);
    }
    setRestOpen((open) => !open);
  }

  async function goToTailPage(next: number) {
    const needed = Math.min(total, 10 + (next + 1) * TAIL_PAGE);
    if (!query.trim() && items.length < needed) {
      const ok = await loadMore();
      if (!ok) return;
    }
    setTailPage(next);
  }

  async function loadMore(): Promise<boolean> {
    if (!board || locked) return false;
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
        campaign: campaign ?? undefined,
      });
      setExtra((current) => ({
        ...current,
        [activeKey]: [...(current[activeKey] ?? []), ...page.items],
      }));
      setErrors((current) => {
        if (!current[activeKey]) return current;
        const next = { ...current };
        delete next[activeKey];
        return next;
      });
      return true;
    } catch {
      setErrors((current) => ({
        ...current,
        [activeKey]: 'Não foi possível carregar mais posições. Tente de novo.',
      }));
      return false;
    } finally {
      setLoadingMore(false);
    }
  }

  function openVideos() {
    setVideosOpen((open) => !open);
  }

  function selectCampaign(next: string) {
    setLoading(true);
    setRestOpen(false);
    setTailPage(0);
    setQuery('');
    setCampaign(next);
  }

  async function requestReview(id: string) {
    setRequestBusy(id);
    setConnectError(null);
    try {
      const next = await api.requestAccountReview(id);
      setAccounts((current) => current.map((item) => (item.id === id ? next : item)));
    } catch (error) {
      setConnectError(
        error instanceof Error ? error.message : 'Não foi possível pedir a nova análise.',
      );
    } finally {
      setRequestBusy(null);
    }
  }

  async function connect(next: SocialPlatform) {
    if (locked) return;
    setConnecting(next);
    setConnectError(null);
    try {
      const start = await api.startOAuth(next);
      if (start.mode === 'handle') {
        setHandleSuggestion(start.suggestedHandle);
        setHandlePlatform(next);
        setConnecting(null);
        return;
      }
      markOAuthStarted(next);
      window.location.href = start.url;
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
        {needsSignup ? (
          <h1 className="arena-standing">Falta pouco para entrar na competição</h1>
        ) : loading ? (
          <div className="arena-skeleton arena-skeleton-hero" aria-hidden>
            <i />
            <i />
          </div>
        ) : blocked ? (
          <h1 className="arena-standing">Falta só o seu @</h1>
        ) : standing?.eligible && standing.position != null ? (
          <h1 className="arena-standing">
            <span className="arena-standing-lead">Você está na</span>{' '}
            <span className="arena-standing-place">
              <span className="arena-ordinal" data-place={placeTone}>
                {standing.position}
                <sup>ª</sup>
              </span>{' '}
              posição
            </span>
          </h1>
        ) : (
          <h1 className="arena-standing">Você ainda não está neste ranking</h1>
        )}
        {loading || blocked || needsSignup ? null : (
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

      {needsSignup ? (
        <CompleteSignupCard
          onDone={async () => {
            await refreshProfile();
            retry();
          }}
        />
      ) : loading ? null : (
        <CompetitionGate
          accounts={accounts}
          busy={connecting ?? requestBusy}
          onConnect={(next) => void connect(next)}
          onRequestReview={locked ? undefined : (id) => void requestReview(id)}
        />
      )}
      {locked ? null : (
        <SocialHandleDialog
          platform={handlePlatform}
          account={accounts.find((item) => item.platform === handlePlatform) ?? null}
          suggestedHandle={handleSuggestion}
          onClose={() => setHandlePlatform(null)}
          onChanged={(next) =>
            setAccounts((current) => [
              ...current.filter((item) => item.platform !== next.platform),
              next,
            ])
          }
        />
      )}
      {connectError ? (
        <Alert variant="error" role="alert">
          {connectError}
          <button type="button" className="arena-retry" onClick={retry}>
            Tentar de novo
          </button>
        </Alert>
      ) : !loading &&
        abandoned &&
        !accounts.some(
          (account) => account.platform === abandoned && account.status !== 'disconnected',
        ) ? (
        <Alert variant="warning" role="status">
          {ABANDONED_OAUTH_HINT[abandoned]}
        </Alert>
      ) : null}

      {loading || needsSignup ? null : (
        <section className="tier" aria-label="Nível">
          <button type="button" className="tier-current" onClick={() => setLadderOpen(true)}>
            <img src={patent.current.image} alt="" />
            <span>
              <small>Seu nível no {platformLabel(platform)}, desde o início</small>
              <strong>{patent.current.name}</strong>
              <em>
                {patent.next
                  ? `Faltam ${formatViews(patent.remaining)} views para ${patent.next.name}.`
                  : 'Você chegou ao nível máximo.'}
              </em>
              <span className="tier-progress" aria-hidden>
                <i style={{ width: `${Math.max(4, Math.round(patent.progress * 100))}%` }} />
              </span>
            </span>
            <span className="tier-more">
              <span>Ver níveis</span>
              <Chevron className="arena-chevron" />
            </span>
          </button>
        </section>
      )}

      {loading || locked ? null : (
        <GrowthCard
          platform={platform}
          connected={
            connectionDuty(accounts.find((account) => account.platform === platform)?.status) ===
            'ready'
          }
        />
      )}

      {featured ? (
        featured.url ? (
          <a className="featured" href={featured.url} target="_blank" rel="noreferrer">
            <FeaturedMedia thumbnailUrl={featured.thumbnailUrl} />
            <div>
              <p>{featuredLabel}</p>
              <strong>{featured.title}</strong>
              <span>{formatViews(featured.views)} views</span>
            </div>
            <span className="featured-open">Abrir vídeo</span>
          </a>
        ) : (
          <article className="featured">
            <FeaturedMedia thumbnailUrl={featured.thumbnailUrl} />
            <div>
              <p>{featuredLabel}</p>
              <strong>{featured.title}</strong>
              <span>{formatViews(featured.views)} views. O link ainda não chegou na coleta.</span>
            </div>
          </article>
        )
      ) : null}

      {locked ? null : (
        <div className="arena-campaign">
          <label htmlFor="arena-campaign">Período</label>
          <select
            id="arena-campaign"
            value={campaign ?? GENERAL_RANKING}
            onChange={(event) => selectCampaign(event.target.value)}
          >
            {campaigns.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.state === 'finished' ? ' (encerrado)' : ''}
              </option>
            ))}
            <option value={GENERAL_RANKING}>Geral, desde o início</option>
          </select>
          <p>{campaignLine(campaigns.find((item) => item.id === campaign))}</p>
        </div>
      )}

      <div className="arena-controls">
        <div className="arena-switch" role="group" aria-label="Tipo de ranking">
          {CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={category === item}
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
                {/* Conectar fica só no cartão de conexão acima, para não repetir o mesmo botão. */}
                {href && !needsLogin ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Abrir perfil no ${platformLabel(item)}`}
                  >
                    <span className="arena-network-text">Perfil</span>
                    <ExternalGlyph />
                  </a>
                ) : null}
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
            <Chevron className="arena-chevron" />
          </button>
        </div>
      </div>

      {videosOpen ? (
        <section id="videos-mais-acessados" aria-label="Vídeos mais acessados">
          {videos.length === 0 && activeCampaign && !blocked ? (
            <EmptyState
              title={`Nenhuma view nova em ${periodName(activeCampaign)} ainda`}
              description="Contam as views que seus vídeos ganham dentro do período, inclusive os vídeos antigos. Publique e divulgue para subir."
              action={
                <Link className="arena-link" to="/conteudos">
                  Ver todos os conteúdos
                </Link>
              }
            />
          ) : videos.length === 0 ? (
            <EmptyState
              title="Nenhum vídeo coletado"
              description={
                blocked
                  ? 'Conecte a rede e aguarde a coleta para ver os vídeos com mais views.'
                  : 'Em coleta. Os vídeos com mais views aparecem aqui depois da próxima leitura.'
              }
              action={
                blocked ? (
                  <Link className="arena-link" to="/conexoes">
                    Conectar redes
                  </Link>
                ) : (
                  <Link className="arena-link" to="/conteudos">
                    Ver todos os conteúdos
                  </Link>
                )
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
                  <Thumbnail src={video.thumbnailUrl} fallbackClass="arena-video-fallback" />
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
          {locked ? null : (
            <button type="button" className="arena-retry" onClick={retry}>
              Tentar de novo
            </button>
          )}
        </Alert>
      ) : !board || total === 0 ? (
        videosOpen && videos.length === 0 ? null : (
          <EmptyState
            title="Ranking ainda vazio"
            description={
              needsSignup
                ? 'Complete o cadastro acima para entrar assim que o ranking abrir.'
                : blocked
                  ? `Conecte o ${platformLabel(platform)} no cartão acima para entrar assim que o ranking abrir.`
                  : activeCampaign
                    ? `Ninguém tem views no ${platformLabel(platform)} em ${periodName(activeCampaign)} ainda. Publique um vídeo para sair na frente.`
                    : `Quando houver views no ${platformLabel(platform)}, o pódio aparece aqui.`
            }
            action={
              locked || blocked || needsSignup ? undefined : (
                <Link className="arena-link" to="/conteudos">
                  Ver seus conteúdos
                </Link>
              )
            }
          />
        )
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
                    showTier={general}
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
                    showTier={general}
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
                onClick={toggleRest}
              >
                <span>
                  {restOpen ? 'Fechar lista' : `Ver do 11º ao ${formatViews(total)}º`}
                  {youAreInTail && !restOpen ? (
                    <small>Sua posição está neste trecho.</small>
                  ) : null}
                </span>
                <Chevron className="arena-chevron" />
              </button>
              {restOpen ? (
                <div className="rest-panel" id="ranking-restante">
                  <input
                    className="rest-search"
                    type="search"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setTailPage(0);
                    }}
                    placeholder="Buscar embaixador"
                    aria-label="Buscar embaixador"
                  />
                  <ol className="rank-list">
                    {shownTail.map((entry) => (
                      <RankRow
                        key={entry.profileId}
                        entry={entry}
                        category={category}
                        showTier={general}
                      />
                    ))}
                  </ol>
                  {visibleTail.length === 0 ? (
                    <p className="arena-note">Nenhum embaixador com esse nome neste trecho.</p>
                  ) : null}
                  {paged && tailPages > 1 ? (
                    <nav className="rest-pages" aria-label="Páginas do ranking">
                      <button
                        type="button"
                        onClick={() => void goToTailPage(tailPage - 1)}
                        disabled={tailPage === 0 || loadingMore}
                      >
                        Anterior
                      </button>
                      <span aria-live="polite">
                        Página {tailPage + 1} de {tailPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => void goToTailPage(tailPage + 1)}
                        disabled={tailPage >= tailPages - 1 || loadingMore}
                      >
                        {loadingMore ? 'Carregando' : 'Próxima'}
                      </button>
                    </nav>
                  ) : !locked && !paged && items.length < total ? (
                    <button
                      type="button"
                      className="more-btn"
                      onClick={() => void loadMore()}
                      disabled={loadingMore}
                    >
                      {loadingMore ? 'Carregando' : 'Carregar mais'}
                    </button>
                  ) : null}
                  {errors[activeKey] ? (
                    <Alert variant="error" role="alert">
                      {errors[activeKey]}
                      <button
                        type="button"
                        className="arena-retry"
                        onClick={() => void loadMore()}
                        disabled={loadingMore}
                      >
                        Tentar de novo
                      </button>
                    </Alert>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      )}

      <dialog
        ref={ladderRef}
        className="tier-layer"
        aria-labelledby={ladderOpen ? 'tier-title' : undefined}
        aria-label={ladderOpen ? undefined : 'Progressão de níveis'}
        onCancel={(event) => {
          event.preventDefault();
          setLadderOpen(false);
        }}
        onClose={() => setLadderOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setLadderOpen(false);
        }}
      >
        {ladderOpen ? (
          <div className="tier-sheet">
            <p className="tier-kicker">Guerreiros embaixadores</p>
            {/* O foco começa no título para a folha abrir no topo e o leitor de tela anunciar o contexto */}
            <h2 id="tier-title" tabIndex={-1} ref={tierTitleRef}>
              Progressão de níveis
            </h2>
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
        ) : null}
      </dialog>

      {slice && !blocked ? (
        <p className="arena-note">
          {slice.lastSyncAt
            ? `Views do ${platformLabel(platform)} atualizadas em ${formatWhen(slice.lastSyncAt)}.`
            : `Primeira coleta do ${platformLabel(platform)} em andamento.`}
        </p>
      ) : null}

      {criteria ? (
        <details className="arena-criteria">
          <summary>
            Como a ordem é definida
            <Chevron className="arena-chevron" />
          </summary>
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
  showTier,
}: {
  place: 1 | 2 | 3;
  entry: RankingEntry | null;
  category: RankingCategory;
  showTier: boolean;
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
          views={showTier ? entry.totalViews : null}
          own={entry.isCurrentUser}
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
  showTier,
  delay = 0,
}: {
  entry: RankingEntry;
  category: RankingCategory;
  showTier: boolean;
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
      <Avatar
        name={entry.publicName}
        url={entry.avatarUrl}
        size="sm"
        views={showTier ? entry.totalViews : null}
        own={entry.isCurrentUser}
      />
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
  return <Thumbnail key={thumbnailUrl ?? 'sem-capa'} src={thumbnailUrl} fallbackClass="featured-fallback" />;
}

/** Capa que some para o bloco neutro se não carregar, em vez do ícone de imagem quebrada. */
function Thumbnail({ src, fallbackClass }: { src: string | null; fallbackClass: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className={fallbackClass} aria-hidden />;
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

/** "Outubro de 2026" vira "outubro de 2026" no meio da frase; campanhas mantêm o nome. */
function periodName(campaign: Campaign): string {
  return campaign.kind === 'monthly'
    ? campaign.name.charAt(0).toLocaleLowerCase('pt-BR') + campaign.name.slice(1)
    : campaign.name;
}

function Avatar({
  name,
  url,
  size,
  views,
  own = false,
}: {
  name: string;
  url: string | null;
  size: 'lg' | 'md' | 'sm';
  /** Views desde o início; nos rankings por período fica nulo e o selo de nível some. */
  views: number | null;
  /** Na própria linha vale a foto atual do perfil, sem esperar o ranking ser publicado de novo. */
  own?: boolean;
}) {
  const { profile } = useAuth();
  const src = own && profile ? profile.avatarUrl : url;
  const [failed, setFailed] = useState<string | null>(null);
  const tier = views == null ? null : patentFor(views).current;
  return (
    <span className={`avatar-wrap avatar-wrap-${size}`}>
      {src && failed !== src ? (
        <img
          className={`avatar avatar-${size}`}
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(src)}
        />
      ) : (
        <span className={`avatar avatar-${size}`} aria-hidden>
          {initial(name)}
        </span>
      )}
      {tier ? <img className="tier-pip" src={tier.image} alt={`Nível ${tier.name}`} /> : null}
    </span>
  );
}

function NetworkGlyph({ platform }: { platform: SocialPlatform }) {
  return <PlatformMark platform={platform} size={22} />;
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" aria-hidden focusable="false">
      <path
        d="M4 6l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExternalGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden focusable="false">
      <path
        d="M4.5 2.5h5v5M9.5 2.5l-7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
