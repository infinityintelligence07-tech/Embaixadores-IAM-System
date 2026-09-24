import { ExternalLink, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { ApiError, api, type ContentItem } from '@/lib/api';

function formatViews(views: number): string {
  return new Intl.NumberFormat('pt-BR').format(views);
}

export function ContentsPage() {
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    api
      .contents()
      .then((data) => {
        if (active) setContents(data);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) {
          setError('Sessão expirada.');
        } else {
          setError(err instanceof Error ? err.message : 'Erro ao carregar conteúdos.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Carregando conteúdos..." />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="error" role="alert" title="Erro">
        {error}
      </Alert>
    );
  }

  const activeContents = contents.filter((c) => !c.excluded);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-brand-gold">
          Monitoramento
        </p>
        <h1 className="font-display text-3xl text-text">Conteúdos</h1>
        <p className="mt-2 text-text-muted">
          Lista de publicações monitoradas nas suas redes conectadas.
        </p>
      </header>

      {activeContents.length === 0 ? (
        <EmptyState
          icon={<Video className="size-8" />}
          title="Nenhum conteúdo monitorado"
          description="Conecte suas redes e aguarde a sincronização para ver seus vídeos aqui."
        />
      ) : (
        <ul className="space-y-3">
          {activeContents.map((item) => (
            <li
              key={item.id}
              className="flex gap-4 rounded-2xl border border-border bg-surface-card p-4"
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
                    {item.platform === 'instagram' ? 'IG' : 'TT'}
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
                  className="mt-2 inline-flex items-center gap-1 text-sm text-brand-gold underline-offset-4 hover:underline"
                >
                  Abrir conteúdo
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      {contents.some((c) => c.excluded) ? (
        <Alert variant="info">
          Alguns conteúdos foram excluídos do ranking pela equipe administrativa.
        </Alert>
      ) : null}
    </div>
  );
}
