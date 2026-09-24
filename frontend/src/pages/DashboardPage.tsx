import {
  Activity,
  Eye,
  Trophy,
  Users,
  Video,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import {
  ApiError,
  api,
  type ConnectionStatus,
  type DashboardResponse,
  type PlatformDashboardSlice,
  type SocialPlatform,
} from '@/lib/api';

function formatNumber(value: number | null | undefined): string {
  if (value == null) return 'Indisponível';
  return new Intl.NumberFormat('pt-BR').format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function platformLabel(platform: SocialPlatform): string {
  return platform === 'instagram' ? 'Instagram' : 'TikTok';
}

function connectionStatusTone(
  status: ConnectionStatus | null,
): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'connected':
      return 'success';
    case 'syncing':
      return 'warning';
    case 'authorization_expired':
    case 'insufficient_permission':
    case 'incompatible_account':
    case 'integration_unavailable':
      return 'danger';
    case 'disconnected':
      return 'neutral';
    default:
      return 'neutral';
  }
}

function connectionStatusLabel(status: ConnectionStatus | null): string {
  switch (status) {
    case 'connected':
      return 'Conectado';
    case 'syncing':
      return 'Sincronizando';
    case 'authorization_expired':
      return 'Autorização expirada';
    case 'insufficient_permission':
      return 'Permissão insuficiente';
    case 'incompatible_account':
      return 'Conta incompatível';
    case 'integration_unavailable':
      return 'Integração indisponível';
    case 'disconnected':
      return 'Desconectado';
    default:
      return 'Indisponível';
  }
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    api
      .dashboard()
      .then((response) => {
        if (active) setData(response);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) {
          setError('Sessão expirada. Faça login novamente.');
        } else {
          setError(err instanceof Error ? err.message : 'Erro ao carregar dashboard.');
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
        <Spinner label="Carregando dashboard..." />
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

  if (!data || data.slices.length === 0) {
    return (
      <EmptyState
        title="Sem dados ainda"
        description="Conecte suas redes e aguarde a primeira sincronização."
        action={
          <Link to="/conexoes">
            <Button>Conectar redes</Button>
          </Link>
        }
      />
    );
  }

  const hasPartialData = data.slices.some(
    (slice) =>
      slice.positionTotal == null ||
      slice.monitoredViewsTotal == null ||
      slice.officialAccountViews == null,
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-brand-gold">
          Painel
        </p>
        <h1 className="font-display text-3xl text-text">Seu desempenho</h1>
        <p className="mt-2 text-text-muted">
          Acompanhe posição, visualizações e saúde das suas conexões por plataforma.
        </p>
      </header>

      {hasPartialData ? (
        <Alert variant="warning" title="Dados parciais">
          Algumas métricas ainda não estão disponíveis. Verifique suas conexões ou
          aguarde a próxima sincronização.
        </Alert>
      ) : null}

      {data.slices.map((slice) => (
        <PlatformSliceSection key={slice.platform} slice={slice} />
      ))}

      <section className="rounded-2xl border border-brand-violet/30 bg-brand-violet/10 p-5">
        <h2 className="font-display text-xl text-text">Como funciona o ranking</h2>
        <p className="mt-2 text-sm leading-relaxed text-violet-100">
          {data.rankingCriteria}
        </p>
        <Link to="/rankings" className="mt-4 inline-block">
          <Button variant="secondary">Ver rankings</Button>
        </Link>
      </section>
    </div>
  );
}

function PlatformSliceSection({ slice }: { slice: PlatformDashboardSlice }) {
  const hasIneligibility = Boolean(slice.ineligibilityReason);

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl text-text">
          {platformLabel(slice.platform)}
        </h2>
        {slice.connectionStatus ? (
          <Badge tone={connectionStatusTone(slice.connectionStatus)}>
            {connectionStatusLabel(slice.connectionStatus)}
          </Badge>
        ) : null}
      </div>

      {hasIneligibility ? (
        <Alert variant="warning" title="Participação no ranking">
          {slice.ineligibilityReason}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          icon={Trophy}
          label="Posição (visualizações totais)"
          value={
            slice.positionTotal != null && slice.totalParticipants != null
              ? `${formatNumber(slice.positionTotal)}º de ${formatNumber(slice.totalParticipants)}`
              : 'Indisponível'
          }
        />
        <MetricCard
          icon={Trophy}
          label="Posição (melhor vídeo)"
          value={
            slice.positionBest != null && slice.totalParticipants != null
              ? `${formatNumber(slice.positionBest)}º de ${formatNumber(slice.totalParticipants)}`
              : 'Indisponível'
          }
        />
        <MetricCard
          icon={Eye}
          label="Visualizações monitoradas"
          value={formatNumber(slice.monitoredViewsTotal)}
        />
        <MetricCard
          icon={Video}
          label="Conteúdos monitorados"
          value={formatNumber(slice.contentCount)}
        />
        <MetricCard
          icon={Users}
          label={slice.officialAccountViewsLabel || 'Conta oficial'}
          value={formatNumber(slice.officialAccountViews)}
        />
        <MetricCard
          icon={Activity}
          label="Última sincronização"
          value={formatDate(slice.lastSyncAt)}
        />
      </div>

      <div className="rounded-xl border border-border bg-surface-elevated p-4">
        <h3 className="font-display text-lg text-text">Melhor vídeo</h3>
        {slice.bestVideo ? (
          <div className="mt-3 space-y-2">
            <p className="font-medium text-text">
              {slice.bestVideo.title ?? 'Sem título'}
            </p>
            <p className="text-sm text-text-muted">
              {formatNumber(slice.bestVideo.views)} visualizações
            </p>
            {slice.bestVideo.permalink ? (
              <a
                href={slice.bestVideo.permalink}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-brand-gold underline-offset-4 hover:underline"
              >
                Ver conteúdo
              </a>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-text-muted">Indisponível</p>
        )}
      </div>

      {slice.syncCoverageRatio != null ? (
        <p className="text-xs text-text-muted">
          Cobertura de sincronização:{' '}
          {new Intl.NumberFormat('pt-BR', {
            style: 'percent',
            maximumFractionDigits: 0,
          }).format(slice.syncCoverageRatio)}
        </p>
      ) : null}
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  badge,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  badge?: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-border bg-surface-elevated p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="rounded-lg bg-brand-gold/10 p-2 text-brand-gold">
          <Icon className="size-5" aria-hidden />
        </div>
        {badge}
      </div>
      <p className="mt-4 text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-text">{value}</p>
    </article>
  );
}
