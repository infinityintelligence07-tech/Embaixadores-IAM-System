import clsx from 'clsx';
import { Crown, Search } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import {
  ApiError,
  api,
  type MyRankingResponse,
  type RankingCategory,
  type RankingEntry,
  type RankingView,
  type RankingsResponse,
  type SocialPlatform,
} from '@/lib/api';

const PAGE_SIZE = 20;

function formatScore(entry: RankingEntry, category: RankingCategory): string {
  const value = category === 'total_views' ? entry.totalViews : entry.bestVideoViews;
  return new Intl.NumberFormat('pt-BR').format(value);
}

function categoryLabel(category: RankingCategory): string {
  return category === 'total_views' ? 'visualizações totais' : 'melhor vídeo';
}

function platformLabel(platform: SocialPlatform): string {
  return platform === 'instagram' ? 'Instagram' : 'TikTok';
}

function buildPersonalRankingMessage(myRanking: MyRankingResponse): string {
  const categoria = categoryLabel(myRanking.category);
  const plataforma = platformLabel(myRanking.platform);

  if (!myRanking.eligible) {
    return myRanking.reason ?? 'Você ainda não é elegível para este ranking.';
  }

  if (myRanking.position == null) {
    return 'Sua posição ainda não está disponível neste ranking.';
  }

  let message = `Você está na posição ${myRanking.position} de ${myRanking.total} embaixadores no ranking de ${categoria} do ${plataforma}.`;

  if (myRanking.gapToAbove != null) {
    const unit =
      myRanking.category === 'total_views'
        ? 'visualizações'
        : 'visualizações no melhor vídeo';
    message += ` Faltam ${new Intl.NumberFormat('pt-BR').format(myRanking.gapToAbove)} ${unit} para ultrapassar quem está acima.`;
  }

  return message;
}

function podiumStyles(position: number) {
  switch (position) {
    case 1:
      return {
        ring: 'ring-podium-gold/60',
        bg: 'bg-gradient-to-b from-podium-gold/25 to-surface-card',
        medal: 'text-podium-gold',
        label: '1º lugar',
        height: 'pt-2',
      };
    case 2:
      return {
        ring: 'ring-podium-silver/50',
        bg: 'bg-gradient-to-b from-podium-silver/20 to-surface-card',
        medal: 'text-podium-silver',
        label: '2º lugar',
        height: 'pt-6',
      };
    case 3:
      return {
        ring: 'ring-podium-bronze/50',
        bg: 'bg-gradient-to-b from-podium-bronze/20 to-surface-card',
        medal: 'text-podium-bronze',
        label: '3º lugar',
        height: 'pt-10',
      };
    default:
      return {
        ring: 'ring-border',
        bg: 'bg-surface-card',
        medal: 'text-text-muted',
        label: `${position}º lugar`,
        height: '',
      };
  }
}

export function RankingsPage() {
  const [category, setCategory] = useState<RankingCategory>('total_views');
  const [platform, setPlatform] = useState<SocialPlatform | ''>('');
  const [view, setView] = useState<RankingView>('all');
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);

  const [rankings, setRankings] = useState<RankingsResponse | null>(null);
  const [myRanking, setMyRanking] = useState<MyRankingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [rankData, meData] = await Promise.all([
        api.rankings({
          category,
          platform: platform || undefined,
          view,
          q: query || undefined,
          page: view === 'all' ? page : undefined,
          pageSize: view === 'all' ? PAGE_SIZE : undefined,
        }),
        api.myRanking({
          category,
          platform: platform || undefined,
        }),
      ]);
      setRankings(rankData);
      setMyRanking(meData);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Sessão expirada.');
      } else {
        setError(err instanceof Error ? err.message : 'Erro ao carregar rankings.');
      }
    } finally {
      setLoading(false);
    }
  }, [category, platform, view, query, page]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(searchInput.trim());
  }

  const top3 = rankings?.items.filter((item) => item.position <= 3) ?? [];
  const displayItems =
    view === 'top3'
      ? top3
      : view === 'top10'
        ? (rankings?.items.filter((item) => item.position <= 10) ?? [])
        : (rankings?.items ?? []);

  const totalPages = rankings
    ? Math.max(1, Math.ceil(rankings.total / rankings.pageSize))
    : 1;

  const personalMessage = myRanking ? buildPersonalRankingMessage(myRanking) : null;

  return (
    <div className="space-y-6 pb-24">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-brand-gold">Competição</p>
        <h1 className="font-display text-3xl text-text">Rankings</h1>
        <p className="mt-2 text-text-muted">
          Compare seu desempenho com outros embaixadores.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <FilterButton
          active={category === 'total_views'}
          onClick={() => {
            setCategory('total_views');
            setPage(1);
          }}
        >
          Visualizações totais
        </FilterButton>
        <FilterButton
          active={category === 'best_video'}
          onClick={() => {
            setCategory('best_video');
            setPage(1);
          }}
        >
          Melhor vídeo
        </FilterButton>
        <FilterButton
          active={platform === ''}
          onClick={() => {
            setPlatform('');
            setPage(1);
          }}
        >
          Todas
        </FilterButton>
        <FilterButton
          active={platform === 'instagram'}
          onClick={() => {
            setPlatform('instagram');
            setPage(1);
          }}
        >
          Instagram
        </FilterButton>
        <FilterButton
          active={platform === 'tiktok'}
          onClick={() => {
            setPlatform('tiktok');
            setPage(1);
          }}
        >
          TikTok
        </FilterButton>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['top3', 'top10', 'all'] as RankingView[]).map((v) => (
          <FilterButton
            key={v}
            active={view === v}
            onClick={() => {
              setView(v);
              setPage(1);
            }}
          >
            {v === 'top3' ? 'Top 3' : v === 'top10' ? 'Top 10' : 'Completo'}
          </FilterButton>
        ))}
      </div>

      {view === 'all' ? (
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="flex-1">
            <Input
              label="Buscar embaixador"
              name="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Nome do embaixador"
              leading={<Search className="size-4" aria-hidden />}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit">Buscar</Button>
          </div>
        </form>
      ) : null}

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Carregando rankings..." />
        </div>
      ) : !rankings || rankings.items.length === 0 ? (
        <EmptyState
          title="Ranking vazio"
          description="Ainda não há participantes com dados suficientes para esta categoria."
        />
      ) : (
        <>
          {personalMessage ? (
            <aside
              className={clsx(
                'rounded-2xl border p-4',
                myRanking?.eligible
                  ? 'border-brand-gold/40 bg-brand-gold/10'
                  : 'border-border bg-surface-card',
              )}
            >
              <p className="text-sm text-text">{personalMessage}</p>
            </aside>
          ) : null}

          {(view === 'top3' || view === 'all') && top3.length > 0 ? (
            <section aria-label="Pódio Top 3">
              <h2 className="sr-only">Pódio — Top 3</h2>
              <div className="grid grid-cols-3 items-end gap-2 sm:gap-4">
                {[2, 1, 3].map((position) => {
                  const entry = top3.find((item) => item.position === position);
                  if (!entry) {
                    return <div key={position} />;
                  }
                  const styles = podiumStyles(position);
                  return (
                    <PodiumCard
                      key={entry.profileId}
                      entry={entry}
                      category={category}
                      styles={styles}
                    />
                  );
                })}
              </div>
            </section>
          ) : null}

          <section aria-label="Lista de ranking">
            <ul className="space-y-2">
              {displayItems.map((entry) => (
                <RankingRow
                  key={`${entry.profileId}-${entry.position}`}
                  entry={entry}
                  category={category}
                />
              ))}
            </ul>
          </section>

          {view === 'all' && totalPages > 1 ? (
            <nav
              aria-label="Paginação do ranking"
              className="flex items-center justify-between gap-4"
            >
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <span className="text-sm text-text-muted">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </nav>
          ) : null}
        </>
      )}

      {myRanking && !loading && personalMessage ? (
        <div
          className="fixed inset-x-0 bottom-16 z-20 border-t border-brand-gold/40 bg-surface-elevated/95 px-4 py-3 backdrop-blur md:bottom-0"
          role="status"
          aria-live="polite"
        >
          <p className="mx-auto max-w-6xl text-center text-sm text-text">
            {personalMessage}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'rounded-full border px-3 py-1.5 text-sm transition-colors',
        active
          ? 'border-brand-violet bg-brand-violet/20 text-violet-100'
          : 'border-border bg-surface-card text-text-muted hover:text-text',
      )}
    >
      {children}
    </button>
  );
}

function PodiumCard({
  entry,
  category,
  styles,
}: {
  entry: RankingEntry;
  category: RankingCategory;
  styles: ReturnType<typeof podiumStyles>;
}) {
  return (
    <article
      className={clsx(
        'rounded-2xl border border-border p-3 text-center ring-2 sm:p-4',
        styles.bg,
        styles.ring,
        styles.height,
      )}
    >
      <Crown className={clsx('mx-auto size-5', styles.medal)} aria-hidden />
      <p className="mt-1 text-xs text-text-muted">{styles.label}</p>
      {entry.avatarUrl ? (
        <img
          src={entry.avatarUrl}
          alt=""
          className="mx-auto mt-2 size-12 rounded-full border border-border object-cover sm:size-14"
        />
      ) : (
        <div className="mx-auto mt-2 flex size-12 items-center justify-center rounded-full bg-surface-elevated text-sm font-semibold sm:size-14">
          {entry.publicName.charAt(0)}
        </div>
      )}
      <h3 className="mt-2 truncate text-sm font-semibold text-text">
        {entry.publicName}
        {entry.isCurrentUser ? (
          <Badge tone="gold" className="ml-1">
            Você
          </Badge>
        ) : null}
      </h3>
      <p className="mt-1 text-lg font-display text-brand-gold">
        {formatScore(entry, category)}
      </p>
    </article>
  );
}

function RankingRow({
  entry,
  category,
}: {
  entry: RankingEntry;
  category: RankingCategory;
}) {
  return (
    <li
      className={clsx(
        'flex items-center gap-3 rounded-xl border px-4 py-3',
        entry.isCurrentUser
          ? 'border-brand-gold/50 bg-brand-gold/10'
          : 'border-border bg-surface-card',
      )}
      aria-current={entry.isCurrentUser ? 'true' : undefined}
    >
      <span
        className={clsx(
          'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
          entry.position <= 3
            ? 'bg-brand-violet/20 text-brand-gold'
            : 'bg-surface-elevated text-text-muted',
        )}
        aria-label={`Posição ${entry.position}`}
      >
        {entry.position}
      </span>
      {entry.avatarUrl ? (
        <img
          src={entry.avatarUrl}
          alt=""
          className="size-9 rounded-full object-cover"
        />
      ) : (
        <div className="flex size-9 items-center justify-center rounded-full bg-surface-elevated text-xs font-semibold">
          {entry.publicName.charAt(0)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-text">
          {entry.publicName}
          {entry.isCurrentUser ? (
            <span className="ml-2 text-xs text-brand-gold">(você)</span>
          ) : null}
          {entry.isStale ? (
            <span className="ml-2 text-xs text-text-muted">(desatualizado)</span>
          ) : null}
        </p>
      </div>
      <p className="text-sm font-semibold text-text">
        {formatScore(entry, category)}
      </p>
    </li>
  );
}
