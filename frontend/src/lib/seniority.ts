export interface Patent {
  level: 1 | 2 | 3 | 4;
  name: string;
  minViews: number;
  line: string;
  image: string;
  step: string;
}

export const PATENTS: readonly Patent[] = [
  {
    level: 1,
    name: 'Despertar',
    minViews: 0,
    line: 'Você entra aqui, antes da primeira mil views.',
    image: '/brand/tiers/despertar.jpg',
    step: 'Nível inicial',
  },
  {
    level: 2,
    name: 'Energia',
    minViews: 1_000,
    line: 'A partir das primeiras 1.000 views.',
    image: '/brand/tiers/energia.jpg',
    step: 'Nível 1',
  },
  {
    level: 3,
    name: 'Prosperidade',
    minViews: 25_000,
    line: 'A partir de 25.000 views.',
    image: '/brand/tiers/prosperidade.jpg',
    step: 'Nível 2',
  },
  {
    level: 4,
    name: 'Governo',
    minViews: 150_000,
    line: 'A partir de 150.000 views.',
    image: '/brand/tiers/governo.jpg',
    step: 'Nível 3',
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
