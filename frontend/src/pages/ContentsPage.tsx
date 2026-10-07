import { ExternalLink, Video } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { ApiError, api, type ContentItem } from '@/lib/api';

const PAGE_SIZE = 10;

function formatViews(views: number): string {
  return new Intl.NumberFormat('pt-BR').format(views);
}

export function ContentsPage() {
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setContents(await api.contents());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Sua sessão expirou. Entre de novo para ver seus conteúdos.');
      } else {
        setError(
          err instanceof Error ? err.message : 'Não foi possível carregar os conteúdos.',
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Carregando conteúdos..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="error" role="alert" title="Não foi possível carregar">
          {error}
        </Alert>
        <Button variant="secondary" onClick={() => void load()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  const activeContents = contents.filter((c) => !c.excluded);
  const visibleContents = activeContents.slice(0, visibleCount);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">Conteúdos</h1>
        <p className="mt-2 text-text-muted">
          Publicações lidas nas suas redes conectadas e as views de cada uma.
        </p>
      </header>

      {activeContents.length === 0 ? (
        <EmptyState
          icon={<Video className="size-8" />}
          title="Nenhum conteúdo em coleta"
          description="Assim que uma rede estiver conectada e a primeira coleta terminar, seus vídeos aparecem aqui."
          action={
            <Link
              to="/conexoes"
              className="inline-flex min-h-[42px] items-center justify-center rounded-xl bg-brand-violet px-4 text-sm font-medium text-white"
            >
              Ir para conexões
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {visibleContents.map((item) => (
            <li
              key={item.id}
              className="flex gap-4 rounded-[14px] border border-border bg-surface-card p-4"
            >
              {item.thumbnailUrl ? (
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  className="size-16 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-text-muted">
                  <Video className="size-6" aria-hidden />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate font-medium text-text">{item.title}</h2>
                  <Badge tone={item.platform === 'instagram' ? 'violet' : 'gold'}>
                    {item.platform === 'instagram' ? 'Instagram' : 'TikTok'}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-text-muted">
                  {formatViews(item.views)} visualizações ·{' '}
                  {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(
                    new Date(item.publishedAt),
                  )}
                </p>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm text-brand-violet underline-offset-4 hover:underline"
                >
                  Abrir conteúdo
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      {activeContents.length > visibleCount ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          >
            Mostrar mais {Math.min(PAGE_SIZE, activeContents.length - visibleCount)} de{' '}
            {activeContents.length - visibleCount} restantes
          </Button>
        </div>
      ) : null}

      {contents.some((c) => c.excluded) ? (
        <Alert variant="info">
          Alguns conteúdos foram retirados do ranking pela equipe.
        </Alert>
      ) : null}
    </div>
  );
}
