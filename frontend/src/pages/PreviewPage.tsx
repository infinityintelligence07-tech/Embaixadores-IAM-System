import { useLayoutEffect, useState } from 'react';
import { AmbassadorArena, type ArenaSnapshot } from '@/components/arena/AmbassadorArena';
import { BrandMark } from '@/components/brand/BrandMark';
import type { RankingCategory, RankingEntry, SocialPlatform } from '@/lib/api';
import { AdminPage, type AdminPreview } from '@/pages/AdminPage';

interface Person {
  name: string;
  total: number;
  best: number;
}

const people: Person[] = [
  { name: 'Helena', total: 980000, best: 420000 },
  { name: 'Caio', total: 870000, best: 180000 },
  { name: 'Lívia', total: 760000, best: 510000 },
  { name: 'Davi', total: 640000, best: 90000 },
  { name: 'Marina', total: 520000, best: 240000 },
  { name: 'Pedro', total: 410000, best: 70000 },
  { name: 'Alice', total: 330000, best: 150000 },
  { name: 'Bruno', total: 250000, best: 60000 },
  { name: 'Clara', total: 190000, best: 80000 },
  { name: 'Mateus', total: 156000, best: 210000 },
  { name: 'Igor', total: 120000, best: 40000 },
  { name: 'Nina', total: 98000, best: 35000 },
  { name: 'Rafael', total: 76000, best: 22000 },
  { name: 'Sofia', total: 54000, best: 18000 },
  { name: 'Theo', total: 31000, best: 12000 },
  { name: 'Lara', total: 18000, best: 9000 },
  { name: 'Otto', total: 7000, best: 4000 },
  { name: 'Bia', total: 2500, best: 1100 },
];

function rank(category: RankingCategory): Person[] {
  return [...people].sort((a, b) =>
    category === 'total_views' ? b.total - a.total : b.best - a.best,
  );
}

function toEntries(category: RankingCategory, ordered: Person[]): RankingEntry[] {
  return ordered.map((person, index) => ({
    position: index + 1,
    profileId: person.name.toLowerCase(),
    publicName: person.name,
    avatarUrl: null,
    score: category === 'total_views' ? person.total : person.best,
    totalViews: person.total,
    bestVideoViews: person.best,
    isStale: person.name === 'Otto',
    isCurrentUser: person.name === 'Mateus',
  }));
}

function board(platform: SocialPlatform, category: RankingCategory): ArenaSnapshot['boards'][`${SocialPlatform}:${RankingCategory}`] {
  const items = toEntries(category, rank(category));
  return {
    items,
    page: 1,
    pageSize: 100,
    total: items.length,
    view: 'all',
    category,
    platform,
  };
}

function standing(
  platform: SocialPlatform,
  category: RankingCategory,
): NonNullable<ArenaSnapshot['standings'][`${SocialPlatform}:${RankingCategory}`]> {
  const items = toEntries(category, rank(category));
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
    platform,
    entry: mine ?? null,
  };
}

const platforms: SocialPlatform[] = ['instagram', 'tiktok'];

const arenaSnapshot: ArenaSnapshot = {
  firstName: 'Mateus',
  accounts: [
    {
      id: 'ig',
      platform: 'instagram',
      username: 'mateus.asm',
      status: 'connected',
      transport: 'demo',
      lastSyncAt: '2026-10-02T18:10:00.000Z',
      syncMessage: null,
    },
    {
      id: 'tt',
      platform: 'tiktok',
      username: 'mateus.asm',
      status: 'connected',
      transport: 'demo',
      lastSyncAt: '2026-10-02T18:12:00.000Z',
      syncMessage: null,
    },
  ],
  contents: [
    {
      id: 'v1',
      platform: 'instagram',
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
      title: 'Bastidor do palco',
      url: 'https://www.tiktok.com/@mateus.asm/video/1',
      views: 140000,
      publishedAt: '2026-09-18T15:00:00.000Z',
      thumbnailUrl: null,
      excluded: false,
    },
  ],
  boards: {
    'instagram:total_views': board('instagram', 'total_views'),
    'instagram:best_video': board('instagram', 'best_video'),
    'tiktok:total_views': board('tiktok', 'total_views'),
    'tiktok:best_video': board('tiktok', 'best_video'),
  },
  standings: {
    'instagram:total_views': standing('instagram', 'total_views'),
    'instagram:best_video': standing('instagram', 'best_video'),
    'tiktok:total_views': standing('tiktok', 'total_views'),
    'tiktok:best_video': standing('tiktok', 'best_video'),
  },
  criteria:
    'A ordem usa as views monitoradas. Empate nas views totais desempata pelo melhor vídeo, depois por quem entrou antes.',
  slices: platforms.map((platform) => ({
    platform,
    positionTotal: standing(platform, 'total_views').position,
    positionBest: standing(platform, 'best_video').position,
    totalParticipants: people.length,
    ineligibilityReason: null,
    monitoredViewsTotal: 156000,
    bestVideo: {
      id: 'v1',
      title: 'O corte que atravessou a semana',
      views: 210000,
      permalink: 'https://instagram.com/p/preview',
    },
    officialAccountViews: 2400000,
    officialAccountViewsLabel: 'Views da conta oficial',
    contentCount: 12,
    lastSyncAt: '2026-10-02T18:12:00.000Z',
    connectionStatus: 'connected',
    syncCoverageRatio: 1,
  })),
};

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

function withoutConnections(source: ArenaSnapshot): ArenaSnapshot {
  const standings = Object.fromEntries(
    Object.entries(source.standings).map(([key, value]) => [
      key,
      value
        ? {
            ...value,
            eligible: false,
            reason: 'Account not connected',
            position: null,
            score: null,
            gapToAbove: null,
            entry: null,
          }
        : value,
    ]),
  ) as ArenaSnapshot['standings'];

  return {
    ...source,
    accounts: [],
    contents: [],
    standings,
    slices: source.slices.map((item) => ({
      ...item,
      connectionStatus: 'disconnected',
      officialAccountViews: null,
      officialAccountViewsLabel: 'Views da conta indisponíveis',
      bestVideo: null,
      lastSyncAt: null,
      monitoredViewsTotal: null,
      positionTotal: null,
      positionBest: null,
    })),
  };
}

export default function PreviewPage() {
  const [tela, setTela] = useState<'arena' | 'admin'>('arena');
  const [semConexao, setSemConexao] = useState(false);
  const apple = tela === 'admin';

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = apple ? 'apple' : 'arena';
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', apple ? '#f5f5f7' : '#070b14');
  }, [apple]);

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
          {apple ? null : (
            <button type="button" className="arena-videos-btn" onClick={() => setSemConexao((value) => !value)}>
              {semConexao ? 'Ver conectado' : 'Ver sem conexão'}
            </button>
          )}
          <button
            type="button"
            className="arena-videos-btn"
            onClick={() => setTela(apple ? 'arena' : 'admin')}
          >
            {apple ? 'Ver ranking' : 'Ver administração'}
          </button>
        </div>
      </header>
      <main className="shell-main">
        {apple ? (
          <AdminPage preview={adminPreview} />
        ) : (
          <AmbassadorArena
            key={semConexao ? 'sem-conexao' : 'conectado'}
            snapshot={semConexao ? withoutConnections(arenaSnapshot) : arenaSnapshot}
          />
        )}
      </main>
    </div>
  );
}
