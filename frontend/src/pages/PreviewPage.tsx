import { useLayoutEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AmbassadorArena, type ArenaSnapshot } from '@/components/arena/AmbassadorArena';
import { BrandMark } from '@/components/brand/BrandMark';
import type {
  MyRankingResponse,
  RankingCategory,
  RankingEntry,
  RankingsResponse,
  SocialAccount,
  SocialPlatform,
} from '@/lib/api';
import { AdminPage, type AdminPreview } from '@/pages/AdminPage';
import { ConnectionsPage } from '@/pages/ConnectionsPage';

interface Person {
  name: string;
  total: number;
  best: number;
  /** Parte das views que veio do Instagram; o resto é do TikTok. */
  instagram: number;
}

const people: Person[] = [
  { name: 'Helena', total: 980000, best: 420000, instagram: 0.7 },
  { name: 'Caio', total: 870000, best: 180000, instagram: 0.2 },
  { name: 'Lívia', total: 760000, best: 510000, instagram: 0.9 },
  { name: 'Davi', total: 640000, best: 90000, instagram: 0.5 },
  { name: 'Marina', total: 520000, best: 240000, instagram: 0.35 },
  { name: 'Pedro', total: 410000, best: 70000, instagram: 1 },
  { name: 'Alice', total: 330000, best: 150000, instagram: 0.6 },
  { name: 'Bruno', total: 250000, best: 60000, instagram: 0 },
  { name: 'Clara', total: 190000, best: 80000, instagram: 0.45 },
  { name: 'Mateus', total: 156000, best: 210000, instagram: 0.63 },
  { name: 'Igor', total: 120000, best: 40000, instagram: 0.8 },
  { name: 'Nina', total: 98000, best: 35000, instagram: 0.3 },
  { name: 'Rafael', total: 76000, best: 22000, instagram: 0.55 },
  { name: 'Sofia', total: 54000, best: 18000, instagram: 0.1 },
  { name: 'Theo', total: 31000, best: 12000, instagram: 0.75 },
  { name: 'Lara', total: 18000, best: 9000, instagram: 0.5 },
  { name: 'Otto', total: 7000, best: 4000, instagram: 0.4 },
  { name: 'Bia', total: 2500, best: 1100, instagram: 0.65 },
];

type Scope = 'all' | SocialPlatform;

/** Recorte de uma pessoa no ranking geral ou numa rede só. */
function slice(person: Person, scope: Scope): { total: number; best: number } {
  if (scope === 'all') return { total: person.total, best: person.best };
  const share = scope === 'instagram' ? person.instagram : 1 - person.instagram;
  return { total: Math.round(person.total * share), best: Math.round(person.best * share) };
}

function toEntries(scope: Scope, category: RankingCategory): RankingEntry[] {
  return people
    .map((person) => ({ person, ...slice(person, scope) }))
    .filter((row) => row.total > 0)
    .sort((a, b) => (category === 'total_views' ? b.total - a.total : b.best - a.best))
    .map((row, index) => ({
      position: index + 1,
      profileId: row.person.name.toLowerCase(),
      publicName: row.person.name,
      avatarUrl: null,
      score: category === 'total_views' ? row.total : row.best,
      totalViews: row.total,
      bestVideoViews: row.best,
      isStale: row.person.name === 'Otto',
      isCurrentUser: row.person.name === 'Mateus',
    }));
}

function board(scope: Scope, category: RankingCategory): RankingsResponse {
  const items = toEntries(scope, category);
  return {
    items,
    page: 1,
    pageSize: 100,
    total: items.length,
    view: 'all',
    category,
    platform: scope === 'all' ? null : scope,
  };
}

function standing(scope: Scope, category: RankingCategory): MyRankingResponse {
  const items = toEntries(scope, category);
  const mine = items.find((item) => item.isCurrentUser);
  const above = mine ? items.find((item) => item.position === mine.position - 1) : undefined;
  return {
    eligible: true,
    reason: null,
    position: mine?.position ?? null,
    total: items.length,
    score: mine?.score ?? null,
    gapToAbove: mine && above ? above.score - mine.score : null,
    category,
    platform: scope === 'all' ? null : scope,
    entry: mine ?? null,
  };
}

const scopes: Scope[] = ['all', 'instagram', 'tiktok'];
const categories: RankingCategory[] = ['total_views', 'best_video'];

function account(
  id: string,
  platform: SocialPlatform,
  username: string,
  reviewStatus: SocialAccount['reviewStatus'],
  views: number,
  reviewNote: string | null = null,
): SocialAccount {
  const synced = reviewStatus === 'approved';
  return {
    id,
    platform,
    username,
    status: 'connected',
    transport: 'demo',
    lastSyncAt: synced ? '2026-10-31T14:10:00.000Z' : null,
    syncMessage: null,
    verificationCode: null,
    reviewStatus,
    reviewNote,
    views,
    createdAt: '2026-10-02T18:10:00.000Z',
  };
}

const approvedAccounts: SocialAccount[] = [
  account('ig-1', 'instagram', 'mateus.asm', 'approved', 74000),
  account('ig-2', 'instagram', 'cortes.do.mateus', 'approved', 24000),
  account('tt-1', 'tiktok', 'mateus.asm', 'approved', 58000),
  account('tt-2', 'tiktok', 'mateus.cortes', 'pending', 0),
];

const arenaSnapshot: ArenaSnapshot = {
  firstName: 'Mateus',
  accounts: approvedAccounts,
  contents: [
    {
      id: 'v1',
      platform: 'instagram',
      accountId: 'ig-1',
      username: 'mateus.asm',
      title: 'O corte que atravessou a semana',
      url: 'https://instagram.com/p/preview',
      views: 210000,
      publishedAt: '2026-09-28T15:00:00.000Z',
      thumbnailUrl: null,
      excluded: false,
    },
    {
      id: 'v2',
      platform: 'instagram',
      accountId: 'ig-2',
      username: 'cortes.do.mateus',
      title: 'Três frases para acordar a mente',
      url: 'https://instagram.com/p/preview-2',
      views: 86000,
      publishedAt: '2026-09-21T15:00:00.000Z',
      thumbnailUrl: null,
      excluded: false,
    },
    {
      id: 'v3',
      platform: 'tiktok',
      accountId: 'tt-1',
      username: 'mateus.asm',
      title: 'Bastidor do palco',
      url: 'https://www.tiktok.com/@mateus.asm/video/1',
      views: 140000,
      publishedAt: '2026-09-18T15:00:00.000Z',
      thumbnailUrl: null,
      excluded: false,
    },
  ],
  boards: Object.fromEntries(
    scopes.flatMap((scope) => categories.map((category) => [`${scope}:${category}`, board(scope, category)])),
  ),
  standings: Object.fromEntries(
    scopes.flatMap((scope) =>
      categories.map((category) => [`${scope}:${category}`, standing(scope, category)]),
    ),
  ),
  dashboard: {
    totalViews: 156000,
    byPlatform: { instagram: 98000, tiktok: 58000 },
    bestVideo: {
      id: 'v1',
      title: 'O corte que atravessou a semana',
      views: 210000,
      permalink: 'https://instagram.com/p/preview',
      platform: 'instagram',
      username: 'mateus.asm',
    },
    lastSyncAt: '2026-10-31T14:10:00.000Z',
    accounts: approvedAccounts.map(({ id, platform, username, views, reviewStatus, lastSyncAt }) => ({
      id,
      platform,
      username,
      views,
      reviewStatus,
      lastSyncAt,
    })),
    rankingCriteria:
      'A ordem usa as views monitoradas de todas as contas aprovadas. Empate nas views totais desempata pelo melhor vídeo, depois por quem entrou antes.',
  },
};

type ArenaState = 'aprovado' | 'sem-conta' | 'aguardando' | 'ajuste';

/** A mesma pessoa antes de ter uma conta aprovada: fora do ranking, que segue visível para ela. */
function outOfRanking(accounts: SocialAccount[]): ArenaSnapshot {
  const standings = Object.fromEntries(
    Object.entries(arenaSnapshot.standings).map(([key, value]) => [
      key,
      value
        ? {
            ...value,
            eligible: false,
            reason: 'Nenhuma conta aprovada ainda',
            position: null,
            score: null,
            gapToAbove: null,
            entry: null,
          }
        : value,
    ]),
  ) as ArenaSnapshot['standings'];
  const boards = Object.fromEntries(
    Object.entries(arenaSnapshot.boards).map(([key, value]) => [
      key,
      value
        ? {
            ...value,
            items: value.items
              .filter((item) => !item.isCurrentUser)
              .map((item, index) => ({ ...item, position: index + 1 })),
            total: value.total - 1,
          }
        : value,
    ]),
  ) as ArenaSnapshot['boards'];
  return {
    ...arenaSnapshot,
    accounts,
    contents: [],
    boards,
    standings,
    dashboard: {
      ...arenaSnapshot.dashboard!,
      totalViews: 0,
      byPlatform: { instagram: 0, tiktok: 0 },
      bestVideo: null,
      lastSyncAt: null,
      accounts: [],
    },
  };
}

function arenaFor(state: ArenaState): ArenaSnapshot {
  switch (state) {
    case 'sem-conta':
      return outOfRanking([]);
    case 'aguardando':
      return outOfRanking([
        account('ig-9', 'instagram', 'mateus.asm', 'pending', 0),
        account('tt-9', 'tiktok', 'mateus.asm', 'pending', 0),
      ]);
    case 'ajuste':
      return outOfRanking([
        account(
          'ig-9',
          'instagram',
          'mateus.asm',
          'changes_requested',
          0,
          'Deixe o perfil público para as views entrarem.',
        ),
        account('tt-9', 'tiktok', 'mateus.asm', 'pending', 0),
      ]);
    default:
      return arenaSnapshot;
  }
}

const connectionsPreview: SocialAccount[] = [
  ...approvedAccounts.slice(0, 2),
  account('ig-3', 'instagram', 'mente.acordada', 'changes_requested', 3100, 'Deixe o perfil público para as views entrarem.'),
  account('ig-4', 'instagram', 'mateus.palestras', 'rejected', 0, 'O perfil não publica conteúdo do programa.'),
  account('ig-5', 'instagram', 'mateus.bastidores', 'pending', 0),
  ...approvedAccounts.slice(2),
];

const ARENA_STATES: { id: ArenaState; label: string }[] = [
  { id: 'aprovado', label: 'No ranking' },
  { id: 'sem-conta', label: 'Sem conta' },
  { id: 'aguardando', label: 'Aguardando' },
  { id: 'ajuste', label: 'Ajuste pedido' },
];

type Screen = 'ranking' | 'conexoes' | 'admin';

const SCREENS: { id: Screen; label: string }[] = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'conexoes', label: 'Conexões' },
  { id: 'admin', label: 'Administração' },
];

const adminPreview: AdminPreview = {
  users: [
    {
      id: 'u1',
      email: 'helena@exemplo.com',
      fullName: 'Helena Prado',
      publicName: 'Helena',
      status: 'pending',
      role: 'ambassador',
      createdAt: '2026-09-20T12:00:00.000Z',
      postsLast30Days: 12,
      contentCount: 40,
      lastPublishedAt: '2026-09-30T12:00:00.000Z',
      daysWithoutPosting: 2,
    },
    {
      id: 'u2',
      email: 'mateus@exemplo.com',
      fullName: 'Mateus Cardoso',
      publicName: 'Mateus',
      status: 'approved',
      role: 'ambassador',
      createdAt: '2026-09-02T12:00:00.000Z',
      postsLast30Days: 4,
      contentCount: 18,
      lastPublishedAt: '2026-09-28T12:00:00.000Z',
      daysWithoutPosting: 4,
    },
    {
      id: 'u3',
      email: 'igor@exemplo.com',
      fullName: 'Igor Nunes',
      publicName: 'Igor',
      status: 'suspended',
      role: 'ambassador',
      createdAt: '2026-08-11T12:00:00.000Z',
      postsLast30Days: 0,
      contentCount: 3,
      lastPublishedAt: '2026-08-17T12:00:00.000Z',
      daysWithoutPosting: 46,
    },
  ],
  syncs: [
    {
      id: 's1',
      profileId: 'mateus',
      platform: 'instagram',
      status: 'succeeded',
      startedAt: '2026-10-02T18:00:00.000Z',
      finishedAt: '2026-10-02T18:02:00.000Z',
      errorMessage: null,
    },
    {
      id: 's2',
      profileId: 'helena',
      platform: 'tiktok',
      status: 'failed',
      startedAt: '2026-10-02T17:00:00.000Z',
      finishedAt: '2026-10-02T17:01:00.000Z',
      errorMessage: 'Autorização expirada',
    },
  ],
  audit: [
    {
      id: 'a1',
      action: 'Aprovação de embaixador',
      actorId: null,
      entityType: 'perfil',
      entityId: 'mateus',
      reason: null,
      createdAt: '2026-09-02T12:10:00.000Z',
    },
  ],
  settings: {
    syncIntervalMinutes: 30,
    staleToleranceHours: 48,
    manualSyncCooldownSeconds: 300,
  },
};

/** Telas com dados de exemplo, só em desenvolvimento. Use ?tela= e ?estado= para abrir direto. */
export default function PreviewPage() {
  const [params, setParams] = useSearchParams();
  const screen = (SCREENS.find((item) => item.id === params.get('tela'))?.id ?? 'ranking') as Screen;
  const state = (ARENA_STATES.find((item) => item.id === params.get('estado'))?.id ??
    'aprovado') as ArenaState;
  const apple = screen === 'admin';

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = apple ? 'apple' : 'arena';
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', apple ? '#f5f5f7' : '#070b14');
  }, [apple]);

  function go(next: { tela?: Screen; estado?: ArenaState }) {
    const search = new URLSearchParams(params);
    if (next.tela) search.set('tela', next.tela);
    if (next.estado) search.set('estado', next.estado);
    setParams(search, { replace: true });
  }

  return (
    <div className={apple ? 'shell shell-apple' : 'shell shell-arena'}>
      <header className="shell-bar">
        <div className="shell-brand">
          {apple ? (
            <span className="shell-brand-name">Embaixadores</span>
          ) : (
            <BrandMark variant="wordmark" />
          )}
        </div>
        <div className="arena-actions">
          {SCREENS.filter((item) => item.id !== screen).map((item) => (
            <button
              key={item.id}
              type="button"
              className="arena-videos-btn"
              onClick={() => go({ tela: item.id })}
            >
              Ver {item.label.toLocaleLowerCase('pt-BR')}
            </button>
          ))}
          {screen === 'ranking' ? (
            <select
              aria-label="Situação do embaixador"
              value={state}
              onChange={(event) => go({ estado: event.target.value as ArenaState })}
            >
              {ARENA_STATES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </header>
      <main className="shell-main">
        {screen === 'admin' ? (
          <AdminPage preview={adminPreview} />
        ) : screen === 'conexoes' ? (
          <ConnectionsPage preview={connectionsPreview} />
        ) : (
          <AmbassadorArena key={state} snapshot={arenaFor(state)} />
        )}
      </main>
    </div>
  );
}
