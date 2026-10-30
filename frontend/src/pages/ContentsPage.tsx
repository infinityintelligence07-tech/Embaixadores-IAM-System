import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Video } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { ApiError, api, type ContentItem } from '@/lib/api';
import { connectionDuty } from '@/lib/connection';
import { formatDay, formatViews, platformLabel } from '@/lib/format';

const PAGE_SIZE = 10;
/** Até aqui a lista cresce na mesma página; acima, vira páginas. */
const EXPAND_LIMIT = 30;

const linkButton =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand-violet px-4 text-sm font-medium text-white transition-opacity hover:opacity-90';

function ContentThumbnail({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  const box = 'h-20 w-[60px] shrink-0 rounded-[10px]';
  if (!src || failed) {
    return (
      <div className={`${box} flex items-center justify-center bg-surface-elevated text-text-muted`}>
        <Video className="size-6" aria-hidden />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${box} bg-surface-elevated object-cover`}
    />
  );
}

function ContentRow({ item }: { item: ContentItem }) {
  const title = item.title?.trim() || 'Publicação sem legenda';
  const day = formatDay(item.publishedAt) ?? 'Data em coleta';
  const body = (
    <>
      <ContentThumbnail src={item.thumbnailUrl} />
      <div className="min-w-0 flex-1">
        <h2 className="line-clamp-2 text-sm font-medium leading-snug text-text">{title}</h2>
        <p className="mt-1.5 text-sm text-text-muted">
          <strong className="font-semibold text-text">{formatViews(item.views)}</strong>{' '}
          {item.views === 1 ? 'view' : 'views'}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
          <Badge tone="neutral">{platformLabel(item.platform)}</Badge>
          <span>{day}</span>
        </div>
      </div>
    </>
  );
  const card = 'flex items-center gap-4 rounded-[14px] border border-border bg-surface-card p-4';

  if (!item.url) return <div className={card}>{body}</div>;
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      aria-label={`${title}. Abrir no ${platformLabel(item.platform)}`}
      className={`${card} transition-colors hover:bg-surface-elevated`}
    >
      {body}
      <ExternalLink className="ml-1 size-4 shrink-0 text-text-muted" aria-hidden />
    </a>
  );
}

export function ContentsPage() {
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [hasReadyAccount, setHasReadyAccount] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [contentsResult, accountsResult] = await Promise.allSettled([
      api.contents(),
      api.socialAccounts(),
    ]);
    setHasReadyAccount(
      accountsResult.status === 'fulfilled'
        ? accountsResult.value.some((account) => connectionDuty(account.status) === 'ready')
        : null,
    );
    if (contentsResult.status === 'fulfilled') {
      setContents(contentsResult.value);
    } else {
      const err = contentsResult.reason;
      if (err instanceof ApiError && err.status === 401) {
        setError('Sua sessão expirou. Saia e entre de novo para ver seus conteúdos.');
      } else {
        setError(
          err instanceof Error
            ? err.message
            : 'Não foi possível carregar os conteúdos. Verifique a internet e tente de novo.',
        );
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeContents = contents.filter((c) => !c.excluded);
  const excludedCount = contents.length - activeContents.length;
  const total = activeContents.length;
  const paged = total > EXPAND_LIMIT;
  const pageCount = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(pageCount - 1, 0));
  const visibleContents = paged
    ? activeContents.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
    : expanded
      ? activeContents
      : activeContents.slice(0, PAGE_SIZE);

  function goToPage(next: number) {
    setPage(next);
    listRef.current?.scrollIntoView({ block: 'start' });
  }

  return (
    <div className="mx-auto max-w-[640px] space-y-6">
      <div>
        <Link
          to="/rankings"
          className="-ml-2 inline-flex min-h-[44px] items-center gap-1 rounded-xl px-2 text-sm text-text-muted transition-colors hover:text-text"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Voltar ao ranking
        </Link>
        <header className="mt-2">
          <h1 className="page-title">Conteúdos</h1>
          <p className="mt-2 text-text-muted">
            Suas publicações nas redes conectadas e as views de cada uma.
          </p>
        </header>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Carregando conteúdos..." />
        </div>
      ) : error ? (
        <div className="space-y-4">
          <Alert variant="error" role="alert" title="Não foi possível carregar">
            {error}
          </Alert>
          <Button variant="secondary" className="min-h-[44px]" onClick={() => void load()}>
            <RefreshCw className="size-4" aria-hidden />
            Tentar de novo
          </Button>
        </div>
      ) : total === 0 ? (
        hasReadyAccount === false ? (
          <EmptyState
            icon={<Video className="size-8" />}
            title="Conecte uma rede para ver seus vídeos"
            description="Depois da conexão, cada publicação aparece aqui com as views dela."
            action={
              <Link to="/conexoes" className={linkButton}>
                Conectar uma rede
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={<Video className="size-8" />}
            title="Seus vídeos estão em coleta"
            description="Assim que a primeira leitura terminar, cada publicação aparece aqui com as views dela. Pode levar alguns minutos."
            action={
              <Link to="/conexoes" className={linkButton}>
                Ver conexões
              </Link>
            }
          />
        )
      ) : (
        <div ref={listRef} className="scroll-mt-24 space-y-4">
          <p className="text-sm text-text-muted">
            {total === 1 ? '1 publicação' : `${formatViews(total)} publicações`}
          </p>
          <ul className="space-y-2.5">
            {visibleContents.map((item) => (
              <li key={item.id}>
                <ContentRow item={item} />
              </li>
            ))}
          </ul>

          {!paged && !expanded && total > PAGE_SIZE ? (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                className="min-h-[44px]"
                onClick={() => setExpanded(true)}
              >
                Mostrar as outras {total - PAGE_SIZE}
              </Button>
            </div>
          ) : null}

          {paged ? (
            <nav
              aria-label="Páginas de conteúdos"
              className="flex items-center justify-between gap-2.5"
            >
              <Button
                variant="secondary"
                className="min-h-[44px]"
                disabled={currentPage === 0}
                onClick={() => goToPage(currentPage - 1)}
              >
                <ChevronLeft className="size-4" aria-hidden />
                Anterior
              </Button>
              <span className="text-sm text-text-muted" aria-live="polite">
                Página {currentPage + 1} de {pageCount}
              </span>
              <Button
                variant="secondary"
                className="min-h-[44px]"
                disabled={currentPage >= pageCount - 1}
                onClick={() => goToPage(currentPage + 1)}
              >
                Próxima
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </nav>
          ) : null}
        </div>
      )}

      {!loading && !error && excludedCount > 0 ? (
        <Alert variant="info">
          {excludedCount === 1
            ? '1 publicação foi retirada do ranking pela equipe e não aparece nesta lista.'
            : `${excludedCount} publicações foram retiradas do ranking pela equipe e não aparecem nesta lista.`}
        </Alert>
      ) : null}
    </div>
  );
}
