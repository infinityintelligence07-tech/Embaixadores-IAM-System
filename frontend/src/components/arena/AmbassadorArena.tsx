import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CompetitionGate } from '@/components/arena/CompetitionGate';
import { GrowthCard } from '@/components/arena/GrowthCard';
import { CompleteSignupCard } from '@/components/arena/CompleteSignupCard';
import { PlatformMark } from '@/components/brand/PlatformMark';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/contexts/AuthContext';
import {
  GENERAL_RANKING,
  api,
  type Campaign,
  type ContentItem,
  type DashboardResponse,
  type MyRankingResponse,
  type RankingCategory,
  type RankingEntry,
  type RankingsResponse,
  type SocialAccount,
  type SocialPlatform,
} from '@/lib/api';
import { firstName, formatViews, ordinal, platformLabel } from '@/lib/format';
import { PLATFORMS, countsInRanking, handleOf } from '@/lib/connection';
import { PATENTS, patentFor } from '@/lib/seniority';
import { describeChase } from '@/lib/standing';
import './arena.css';

const CATEGORIES: RankingCategory[] = ['total_views', 'best_video'];
/** Acima de 30 posições o restante vira páginas; até 30 abre inteiro. */
const TAIL_PAGE = 20;

/** "all" é o ranking geral, que vale para posição e nível; as redes são só consulta. */
type Scope = 'all' | SocialPlatform;
type BoardKey = `${Scope}:${RankingCategory}`;

export interface ArenaSnapshot {
  firstName: string;
  accounts: SocialAccount[];
  contents: ContentItem[];
  boards: Partial<Record<BoardKey, RankingsResponse>>;
  standings: Partial<Record<BoardKey, MyRankingResponse>>;
  dashboard: DashboardResponse | null;
}

function boardKey(scope: Scope, category: RankingCategory): BoardKey {
  return `${scope}:${category}`;
}

function scopePlatform(scope: Scope): SocialPlatform | undefined {
  return scope === 'all' ? undefined : scope;
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

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function AmbassadorArena({ snapshot }: { snapshot?: ArenaSnapshot }) {
  const { profile, refreshProfile } = useAuth();
  const locked = snapshot != null;
  const [category, setCategory] = useState<RankingCategory>('total_views');
  // Abre sempre em todas as redes; a escolha não fica guardada entre visitas.
  const [scope, setScope] = useState<Scope>('all');
  const [boards, setBoards] = useState<ArenaSnapshot['boards']>(snapshot?.boards ?? {});
  const [standings, setStandings] = useState<ArenaSnapshot['standings']>(
    snapshot?.standings ?? {},
  );
  const [accounts, setAccounts] = useState<SocialAccount[]>(snapshot?.accounts ?? []);
  const [contents, setContents] = useState<ContentItem[]>(snapshot?.contents ?? []);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(snapshot?.dashboard ?? null);
  const [errors, setErrors] = useState<Partial<Record<BoardKey, string>>>({});
  const [loading, setLoading] = useState(!locked);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [restOpen, setRestOpen] = useState(false);
  const [tailPage, setTailPage] = useState(0);
  const [query, setQuery] = useState('');
  const [videosOpen, setVideosOpen] = useState(false);
  const [extra, setExtra] = useState<Partial<Record<BoardKey, RankingEntry[]>>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [ladderOpen, setLadderOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaign, setCampaign] = useState<string | null>(locked ? GENERAL_RANKING : null);
  const [requestBusy, setRequestBusy] = useState<string | null>(null);
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

  // O ranking geral carrega primeiro; o de cada rede só quando a pessoa filtra.
  useEffect(() => {
    if (locked || campaign === null) return;
    const selected = campaign;
    let active = true;

    async function load() {
      const loaded = await Promise.all(
        CATEGORIES.map(async (itemCategory) => {
          const id = boardKey('all', itemCategory);
          try {
            const [board, standing] = await Promise.all([
              api.rankings({ category: itemCategory, view: 'all', page: 1, pageSize: 100, campaign: selected }),
              api.myRanking({ category: itemCategory, campaign: selected }),
            ]);
            return { id, board, standing };
          } catch (error) {
            return { id, error: errorText(error, 'Não foi possível carregar o ranking. Tente de novo.') };
          }
        }),
      );
      const [accountResult, contentResult, dashboardResult] = await Promise.allSettled([
        api.socialAccounts(),
        api.contents(selected === GENERAL_RANKING ? undefined : selected),
        api.dashboard(),
      ]);
      if (!active) return;

      const nextBoards: ArenaSnapshot['boards'] = {};
      const nextStandings: ArenaSnapshot['standings'] = {};
      const nextErrors: Partial<Record<BoardKey, string>> = {};
      for (const item of loaded) {
        if ('error' in item && item.error) nextErrors[item.id] = item.error;
        if ('board' in item && item.board) nextBoards[item.id] = item.board;
        if ('standing' in item && item.standing) nextStandings[item.id] = item.standing;
      }
      setBoards(nextBoards);
      setStandings(nextStandings);
      setErrors(nextErrors);
      setExtra({});
      if (accountResult.status === 'fulfilled') setAccounts(accountResult.value);
      if (contentResult.status === 'fulfilled') setContents(contentResult.value);
      if (dashboardResult.status === 'fulfilled') setDashboard(dashboardResult.value);
      setAccountsError(
        accountResult.status === 'rejected' ? 'Não foi possível carregar suas contas.' : null,
      );
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [locked, attempt, campaign]);

  const activeKey = boardKey(scope, category);
  const generalKey = boardKey('all', category);
  const scopeMissing = scope !== 'all' && !boards[activeKey] && !errors[activeKey];

  useEffect(() => {
    if (locked || loading || campaign === null || !scopeMissing) return;
    const platform: SocialPlatform = scope;
    const key = activeKey;
    let active = true;
    setScopeLoading(true);
    Promise.all([
      api.rankings({ platform, category, view: 'all', page: 1, pageSize: 100, campaign }),
      api.myRanking({ platform, category, campaign }),
    ])
      .then(([board, standing]) => {
        if (!active) return;
        setBoards((current) => ({ ...current, [key]: board }));
        setStandings((current) => ({ ...current, [key]: standing }));
      })
      .catch((error) => {
        if (!active) return;
        setErrors((current) => ({
          ...current,
          [key]: errorText(error, `Não foi possível carregar o ranking do ${platformLabel(platform)}.`),
        }));
      })
      .finally(() => {
        if (active) setScopeLoading(false);
      });
    return () => {
      active = false;
    };
  }, [locked, loading, campaign, scope, category, activeKey, scopeMissing]);

  const name = snapshot?.firstName ?? firstName(profile?.fullName, profile?.publicName);

  // Posição, distância e nível vêm sempre do ranking geral.
  const general = boards[generalKey];
  const generalStanding = standings[generalKey];
  const generalItems = useMemo(
    () => [...(general?.items ?? []), ...(extra[generalKey] ?? [])],
    [general?.items, extra, generalKey],
  );
  const me = generalItems.find((item) => item.isCurrentUser);
  const below = me ? generalItems.find((item) => item.position === me.position + 1) : undefined;
  const belowGap = me && below ? entryScore(me, category) - entryScore(below, category) : null;
  const chase = describeChase({
    eligible: generalStanding?.eligible ?? false,
    reason: generalStanding?.reason ?? null,
    position: generalStanding?.position ?? null,
    total: general?.total ?? generalStanding?.total ?? 0,
    gapToAbove: generalStanding?.gapToAbove ?? null,
    myScore: generalStanding?.score ?? null,
    belowGap,
    category,
  });

  // A lista embaixo segue o filtro de rede.
  const board = boards[activeKey];
  const standing = standings[activeKey];
  const items = useMemo(
    () => [...(board?.items ?? []), ...(extra[activeKey] ?? [])],
    [board?.items, extra, activeKey],
  );
  const total = board?.total ?? standing?.total ?? 0;

  const activeCampaign = campaigns.find((item) => item.id === campaign);
  const wholeCareer = campaign === GENERAL_RANKING;
  const counting = accounts.filter(countsInRanking);
  const countingIds = new Set(counting.map((account) => account.id));
  const videos = contents
    .filter((item) => !item.excluded && countingIds.has(item.accountId))
    .sort((a, b) => b.views - a.views)
    .slice(0, 6);
  // O nível acompanha a carreira inteira: não volta ao primeiro quando um mês novo começa.
  const lifetimeViews =
    dashboard?.totalViews ??
    (wholeCareer ? standings[boardKey('all', 'total_views')]?.score ?? 0 : 0);
  const patent = patentFor(lifetimeViews);
  const blocked = !loading && counting.length === 0;
  const featured = blocked
    ? null
    : videos[0]
      ? {
          title: videos[0].title || 'Sem título',
          views: videos[0].views,
          url: videos[0].url,
          thumbnailUrl: videos[0].thumbnailUrl,
          platform: videos[0].platform,
          username: videos[0].username,
        }
      : !activeCampaign && dashboard?.bestVideo
        ? {
            title: dashboard.bestVideo.title || 'Sem título',
            views: dashboard.bestVideo.views,
            url: dashboard.bestVideo.permalink ?? '',
            thumbnailUrl: null,
            platform: dashboard.bestVideo.platform,
            username: dashboard.bestVideo.username,
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
  // O selo de nível usa as views de todas as redes; num ranking por rede ele mentiria.
  const showTier = wholeCareer && scope === 'all';
  const scopeName = scope === 'all' ? null : platformLabel(scope);
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

  function resetList() {
    setRestOpen(false);
    setTailPage(0);
    setQuery('');
  }

  function selectCategory(next: RankingCategory) {
    setCategory(next);
    resetList();
  }

  function selectScope(next: Scope) {
    setScope(next);
    resetList();
    setErrors((current) => {
      const key = boardKey(next, category);
      if (next === 'all' || !current[key]) return current;
      const copy = { ...current };
      delete copy[key];
      return copy;
    });
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
    const key = activeKey;
    setLoadingMore(true);
    try {
      const page = await api.rankings({
        platform: scopePlatform(scope),
        category,
        view: 'all',
        page: nextPage,
        pageSize,
        campaign: campaign ?? undefined,
      });
      setExtra((current) => ({
        ...current,
        [key]: [...(current[key] ?? []), ...page.items],
      }));
      setErrors((current) => {
        if (!current[key]) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
      return true;
    } catch {
      setErrors((current) => ({
        ...current,
        [key]: 'Não foi possível carregar mais posições. Tente de novo.',
      }));
      return false;
    } finally {
      setLoadingMore(false);
    }
  }

  function selectCampaign(next: string) {
    setLoading(true);
    resetList();
    setCampaign(next);
  }

  async function requestReview(id: string) {
    setRequestBusy(id);
    setAccountsError(null);
    try {
      if (locked) {
        setAccounts((current) =>
          current.map((item) =>
            item.id === id ? { ...item, reviewStatus: 'pending', reviewNote: null } : item,
          ),
        );
        return;
      }
      const next = await api.requestAccountReview(id);
      setAccounts((current) => current.map((item) => (item.id === id ? next : item)));
    } catch (error) {
      setAccountsError(errorText(error, 'Não foi possível pedir a nova análise.'));
    } finally {
      setRequestBusy(null);
    }
  }

  const placeTone =
    generalStanding?.position != null && generalStanding.position <= 3
      ? String(generalStanding.position)
      : 'rest';
  const listLoading = loading || (scopeMissing && (scopeLoading || !locked));

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
          <h1 className="arena-standing">Falta pouco para entrar no ranking</h1>
        ) : generalStanding?.eligible && generalStanding.position != null ? (
          <h1 className="arena-standing">
            <span className="arena-standing-lead">Você está na</span>{' '}
            <span className="arena-standing-place">
              <span className="arena-ordinal" data-place={placeTone}>
                {generalStanding.position}
                <sup>ª</sup>
              </span>{' '}
              posição
            </span>
          </h1>
        ) : (
          <h1 className="arena-standing">Você ainda não está no ranking</h1>
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
          busy={requestBusy}
          onRequestReview={(id) => void requestReview(id)}
        />
      )}
      {accountsError ? (
        <Alert variant="error" role="alert">
          {accountsError}
          <button type="button" className="arena-retry" onClick={retry}>
            Tentar de novo
          </button>
        </Alert>
      ) : null}

      {loading || needsSignup ? null : (
        <section className="tier" aria-label="Nível">
          <button type="button" className="tier-current" onClick={() => setLadderOpen(true)}>
            <img src={patent.current.image} alt="" />
            <span>
              <small>Seu nível, desde o início</small>
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

      {loading || locked ? null : <GrowthCard active={counting.length > 0} />}

      {featured ? (
        featured.url ? (
          <a className="featured" href={featured.url} target="_blank" rel="noreferrer">
            <FeaturedMedia thumbnailUrl={featured.thumbnailUrl} />
            <div>
              <p>{featuredLabel}</p>
              <strong>{featured.title}</strong>
              <span>
                {formatViews(featured.views)} views
                <FeaturedOrigin platform={featured.platform} username={featured.username} />
              </span>
            </div>
            <span className="featured-open">Abrir vídeo</span>
          </a>
        ) : (
          <article className="featured">
            <FeaturedMedia thumbnailUrl={featured.thumbnailUrl} />
            <div>
              <p>{featuredLabel}</p>
              <strong>{featured.title}</strong>
              <span>
                {formatViews(featured.views)} views
                <FeaturedOrigin platform={featured.platform} username={featured.username} />. O
                link ainda não chegou na coleta.
              </span>
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
          <button
            type="button"
            className="arena-videos-btn"
            aria-expanded={videosOpen}
            aria-controls="videos-mais-acessados"
            onClick={() => setVideosOpen((open) => !open)}
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
                  ? 'Os vídeos aparecem aqui depois que uma conta sua for aprovada e coletada.'
                  : 'Em coleta. Os vídeos com mais views aparecem aqui depois da próxima leitura.'
              }
              action={
                blocked ? (
                  <Link className="arena-link" to="/conexoes">
                    Ver minhas contas
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

      <div className="arena-scope" role="group" aria-label="Filtrar o ranking por rede">
        <span className="arena-scope-label" aria-hidden>
          Ver ranking de
        </span>
        <button type="button" aria-pressed={scope === 'all'} onClick={() => selectScope('all')}>
          Todas as redes
        </button>
        {PLATFORMS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={scope === item}
            onClick={() => selectScope(item)}
          >
            <PlatformMark platform={item} size={20} />
            {platformLabel(item)}
          </button>
        ))}
      </div>

      {scope !== 'all' && scopeName ? (
        <div className="arena-scope-note" role="status">
          <PlatformMark platform={scope} size={28} />
          <p>
            <strong>Ranking só do {scopeName}.</strong> Aqui cada pessoa soma apenas as contas
            aprovadas do {scopeName}
            {standing?.eligible && standing.position != null
              ? `, e você está na ${ordinal(standing.position)} posição`
              : ''}
            . O que vale para a sua posição e o seu nível é o ranking de todas as redes.
          </p>
          <button type="button" onClick={() => selectScope('all')}>
            Voltar para todas as redes
          </button>
        </div>
      ) : null}

      {listLoading ? (
        <div className="arena-skeleton" aria-hidden>
          <i />
          <i />
          <i />
        </div>
      ) : errors[activeKey] && !board ? (
        <Alert variant="error" role="alert">
          {errors[activeKey]}
          {locked ? null : (
            <button
              type="button"
              className="arena-retry"
              onClick={() => (scope === 'all' ? retry() : selectScope(scope))}
            >
              Tentar de novo
            </button>
          )}
        </Alert>
      ) : !board || total === 0 ? (
        videosOpen && videos.length === 0 ? null : (
          <EmptyState
            title={scopeName ? `Ranking do ${scopeName} ainda vazio` : 'Ranking ainda vazio'}
            description={
              needsSignup
                ? 'Complete o cadastro acima para entrar assim que o ranking abrir.'
                : blocked
                  ? 'Adicione uma conta e aguarde a aprovação da equipe para entrar assim que o ranking abrir.'
                  : activeCampaign
                    ? `Ninguém tem views${scopeName ? ` no ${scopeName}` : ''} em ${periodName(activeCampaign)} ainda. Publique um vídeo para sair na frente.`
                    : `Quando houver views${scopeName ? ` no ${scopeName}` : ''}, o pódio aparece aqui.`
            }
            action={
              scopeName ? (
                <button type="button" className="arena-link" onClick={() => selectScope('all')}>
                  Voltar para todas as redes
                </button>
              ) : locked || blocked || needsSignup ? undefined : (
                <Link className="arena-link" to="/conteudos">
                  Ver seus conteúdos
                </Link>
              )
            }
          />
        )
      ) : (
        <>
          <section className="podium-wrap" aria-label={scopeName ? `Pódio do ${scopeName}` : 'Pódio'}>
            <div className="podium">
              {([2, 1, 3] as const).map((place) => {
                const entry = items.find((item) => item.position === place) ?? null;
                return (
                  <Pedestal
                    key={place}
                    place={place}
                    entry={entry}
                    category={category}
                    showTier={showTier}
                  />
                );
              })}
            </div>
          </section>

          {topBand.length > 0 ? (
            <section className="rank-block" aria-label={scopeName ? `Top 10 do ${scopeName}` : 'Top 10'}>
              <h2>{scopeName ? `Top 10 do ${scopeName}` : 'Top 10'}</h2>
              <ol className="rank-list">
                {topBand.map((entry, index) => (
                  <RankRow
                    key={entry.profileId}
                    entry={entry}
                    category={category}
                    showTier={showTier}
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
                        showTier={showTier}
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

      {dashboard && !blocked ? (
        <p className="arena-note">
          {dashboard.lastSyncAt
            ? `Views atualizadas em ${formatWhen(dashboard.lastSyncAt)}.`
            : 'Primeira coleta das suas contas em andamento.'}
        </p>
      ) : null}

      {dashboard?.rankingCriteria ? (
        <details className="arena-criteria">
          <summary>
            Como a ordem é definida
            <Chevron className="arena-chevron" />
          </summary>
          <p>{dashboard.rankingCriteria}</p>
        </details>
      ) : null}
    </div>
  );
}

/** De qual conta veio o vídeo: o destaque junta todas as redes. */
function FeaturedOrigin({
  platform,
  username,
}: {
  platform: SocialPlatform;
  username: string | null;
}) {
  const handle = handleOf(username);
  return (
    <>
      {' '}
      no {platformLabel(platform)}
      {handle ? ` (${handle})` : ''}
    </>
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
