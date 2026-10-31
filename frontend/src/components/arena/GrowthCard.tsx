import { useEffect, useId, useState } from 'react';
import { api, type GrowthResponse } from '@/lib/api';
import { formatViews } from '@/lib/format';

const WIDTH = 320;
const HEIGHT = 96;

/** "2026-10-30" vira "30/10" sem passar por fuso horário. */
function dayLabel(day: string): string {
  const [, month, date] = day.split('-');
  return `${date}/${month}`;
}

function chartPath(values: number[]): { line: string; area: string } {
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const span = Math.max(max - min, 1);
  const step = values.length > 1 ? WIDTH / (values.length - 1) : WIDTH;
  const points = values.map((value, index) => {
    const x = values.length > 1 ? index * step : WIDTH / 2;
    const y = HEIGHT - 8 - ((value - min) / span) * (HEIGHT - 16);
    return [x, y] as const;
  });
  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${points[points.length - 1][0].toFixed(1)},${HEIGHT} L${points[0][0].toFixed(1)},${HEIGHT} Z`;
  return { line, area };
}

/** Quanto as views do embaixador cresceram por dia, somando todas as contas aprovadas. */
export function GrowthCard({ active }: { active: boolean }) {
  const gradientId = useId();
  const [data, setData] = useState<GrowthResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active) return;
    let current = true;
    setState('loading');
    api
      .growth()
      .then((result) => {
        if (!current) return;
        setData(result);
        setState('ready');
      })
      .catch(() => {
        if (current) setState('error');
      });
    return () => {
      current = false;
    };
  }, [active, attempt]);

  if (!active) return null;

  const points = data?.points ?? [];

  return (
    <section className="growth" aria-labelledby={`${gradientId}-title`}>
      <header>
        <h2 id={`${gradientId}-title`}>Seu crescimento</h2>
        {state === 'ready' && data?.lastWeek != null ? (
          <p className="growth-delta">
            {data.lastWeek > 0 ? `+${formatViews(data.lastWeek)} views em 7 dias` : 'Sem views novas em 7 dias'}
          </p>
        ) : null}
      </header>

      {state === 'loading' ? (
        <div className="growth-skeleton" aria-hidden />
      ) : state === 'error' ? (
        <p className="growth-empty">
          Não foi possível carregar o seu crescimento.{' '}
          <button type="button" className="arena-retry" onClick={() => setAttempt((n) => n + 1)}>
            Tentar de novo
          </button>
        </p>
      ) : points.length < 2 ? (
        <p className="growth-empty">
          Em coleta. O gráfico aparece a partir do segundo dia com views medidas.
        </p>
      ) : (
        <>
          <p className="growth-total">
            <strong>{formatViews(data?.current ?? 0)}</strong> views acumuladas até hoje, somando suas contas aprovadas
          </p>
          <svg
            className="growth-chart"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Views de ${dayLabel(points[0].day)} a ${dayLabel(points[points.length - 1].day)}: de ${formatViews(points[0].views)} para ${formatViews(points[points.length - 1].views)}.`}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-2)" stopOpacity="0.45" />
                <stop offset="100%" stopColor="var(--accent-2)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={chartPath(points.map((p) => p.views)).area} fill={`url(#${gradientId})`} />
            <path
              d={chartPath(points.map((p) => p.views)).line}
              fill="none"
              stroke="var(--accent-2)"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          </svg>
          <p className="growth-axis">
            <span>{dayLabel(points[0].day)}</span>
            <span>{dayLabel(points[points.length - 1].day)}</span>
          </p>
        </>
      )}
    </section>
  );
}
