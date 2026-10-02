export interface Patent {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  minViews: number;
  line: string;
}

export const PATENTS: readonly Patent[] = [
  {
    level: 1,
    name: 'Recruta',
    minViews: 0,
    line: 'Sua voz está começando a aparecer.',
  },
  {
    level: 2,
    name: 'Voz',
    minViews: 2_500,
    line: 'As pessoas já param para ouvir.',
  },
  {
    level: 3,
    name: 'Embaixador',
    minViews: 15_000,
    line: 'Você representa o movimento.',
  },
  {
    level: 4,
    name: 'Referência',
    minViews: 60_000,
    line: 'Outros medem o próprio ritmo pelo seu.',
  },
  {
    level: 5,
    name: 'Ícone',
    minViews: 200_000,
    line: 'Seu alcance já atravessa a rede.',
  },
  {
    level: 6,
    name: 'Lenda',
    minViews: 750_000,
    line: 'Patente máxima. O ranking inteiro te enxerga.',
  },
];

export interface PatentProgress {
  current: Patent;
  next: Patent | null;
  progress: number;
  remaining: number;
}

export function patentFor(views: number): PatentProgress {
  const safe = Number.isFinite(views) ? Math.max(0, views) : 0;
  let current: Patent = PATENTS[0];
  for (const patent of PATENTS) {
    if (safe >= patent.minViews) current = patent;
  }
  const next = PATENTS.find((patent) => patent.level === current.level + 1) ?? null;
  if (!next) {
    return { current, next: null, progress: 1, remaining: 0 };
  }
  const span = next.minViews - current.minViews;
  const gained = safe - current.minViews;
  return {
    current,
    next,
    progress: span <= 0 ? 1 : Math.min(1, Math.max(0, gained / span)),
    remaining: Math.max(0, next.minViews - safe),
  };
}
