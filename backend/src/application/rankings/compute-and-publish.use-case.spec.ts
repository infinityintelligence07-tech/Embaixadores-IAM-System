import { describe, expect, it, vi } from 'vitest';
import { ComputeAndPublishRankingUseCase } from './compute-and-publish.use-case';
import { PublishRankingInput } from '../../ports/repositories.port';
import {
  AccountReviewStatus,
  AppRole,
  ConnectionStatus,
  MembershipStatus,
  RankingCategory,
  SocialPlatform,
} from '../../domain/types';

const NOW = new Date('2026-10-30T12:00:00Z');
const SYNCED = new Date('2026-10-30T11:00:00Z');

function account(
  id: string,
  profileId: string,
  platform: SocialPlatform,
  reviewStatus = AccountReviewStatus.Approved,
) {
  return {
    id,
    profileId,
    platform,
    username: id,
    status: ConnectionStatus.Connected,
    reviewStatus,
    reviewNote: null,
    lastSyncedAt: SYNCED,
    lastSuccessfulSyncAt: SYNCED,
    syncCoverageRatio: 1,
    disconnectedAt: null,
  };
}

const membership = (profileId: string) => ({
  id: `m-${profileId}`,
  profileId,
  status: MembershipStatus.Approved,
  approvedAt: new Date('2026-10-01T00:00:00Z'),
  createdAt: new Date('2026-10-01T00:00:00Z'),
});

const profile = (id: string, role = AppRole.Ambassador) => ({
  id,
  publicName: id.toUpperCase(),
  avatarUrl: null,
  role,
  deletedAt: null,
});

/** Views por conta: total e melhor vídeo (o id do vídeo é `c-<conta>`). */
const METRICS: Record<string, [number, number]> = {
  'ana-ig-1': [100, 60],
  'ana-ig-2': [50, 50],
  'ana-tt-1': [300, 200],
  'ana-ig-pendente': [10_000, 10_000],
  'bia-tt-1': [400, 400],
  'bia-ig-pendente': [9_000, 9_000],
  'equipe-ig': [99_999, 99_999],
};

function setup() {
  const published: PublishRankingInput[] = [];
  const useCase = new ComputeAndPublishRankingUseCase(
    { now: () => NOW },
    {
      publishAtomic: vi.fn(async (input: PublishRankingInput) => {
        published.push(input);
        return { version: { id: `v${published.length}` }, entries: [] };
      }),
    } as never,
    {
      findApproved: vi.fn(async () => [membership('ana'), membership('bia'), membership('equipe')]),
    } as never,
    {
      findAllActive: vi.fn(async () => [
        account('ana-ig-1', 'ana', SocialPlatform.Instagram),
        account('ana-ig-2', 'ana', SocialPlatform.Instagram),
        account('ana-tt-1', 'ana', SocialPlatform.TikTok),
        account('ana-ig-pendente', 'ana', SocialPlatform.Instagram, AccountReviewStatus.Pending),
        account('bia-tt-1', 'bia', SocialPlatform.TikTok),
        account('bia-ig-pendente', 'bia', SocialPlatform.Instagram, AccountReviewStatus.Pending),
        account('equipe-ig', 'equipe', SocialPlatform.Instagram),
      ]),
    } as never,
    {
      aggregateEligibleMetricsByAccount: vi.fn(async (id: string) => ({
        profileId: id.split('-')[0],
        totalViews: METRICS[id][0],
        bestVideoViews: METRICS[id][1],
        bestContentId: `c-${id}`,
      })),
      getLatestAccountSnapshot: vi.fn(async () => null),
    } as never,
    {
      findById: vi.fn(async (id: string) =>
        profile(id, id === 'equipe' ? AppRole.Admin : AppRole.Ambassador),
      ),
    } as never,
    { getNumber: vi.fn(async () => 24) } as never,
    {} as never,
  );
  const board = (platform: SocialPlatform | null, category: RankingCategory) => {
    const found = published.find((item) => item.platform === platform && item.category === category);
    if (!found) throw new Error(`quadro ${platform ?? 'geral'}/${category} não publicado`);
    return found.entries.map((entry) => [entry.profileId, entry.score, entry.position]);
  };
  return { useCase, published, board };
}

describe('ComputeAndPublishRankingUseCase.publishBoards', () => {
  it('publica três quadros por categoria: geral e um por rede', async () => {
    const { useCase, published } = setup();

    await useCase.publishBoards(null);

    expect(published.map((item) => `${item.platform ?? 'geral'}/${item.category}`).sort()).toEqual(
      [
        'geral/best_video',
        'geral/total_views',
        'instagram/best_video',
        'instagram/total_views',
        'tiktok/best_video',
        'tiktok/total_views',
      ],
    );
    expect(published.every((item) => item.campaignId === null)).toBe(true);
  });

  it('o geral soma as contas aprovadas das duas redes e ignora a não aprovada', async () => {
    const { useCase, board } = setup();

    await useCase.publishBoards(null);

    // Ana: 100 + 50 (Instagram) + 300 (TikTok); a conta pendente de 10.000 não entra.
    expect(board(null, RankingCategory.TotalViews)).toEqual([
      ['ana', 450, 1],
      ['bia', 400, 2],
    ]);
  });

  it('cada rede soma só as contas aprovadas dela, e quem não tem conta aprovada na rede fica de fora', async () => {
    const { useCase, board } = setup();

    await useCase.publishBoards(null);

    expect(board(SocialPlatform.Instagram, RankingCategory.TotalViews)).toEqual([['ana', 150, 1]]);
    expect(board(SocialPlatform.TikTok, RankingCategory.TotalViews)).toEqual([
      ['bia', 400, 1],
      ['ana', 300, 2],
    ]);
  });

  it('o melhor vídeo é o maior entre todas as contas do quadro', async () => {
    const { useCase, board, published } = setup();

    await useCase.publishBoards(null);

    expect(board(null, RankingCategory.BestVideo)).toEqual([
      ['bia', 400, 1],
      ['ana', 200, 2],
    ]);
    const general = published.find(
      (item) => item.platform === null && item.category === RankingCategory.BestVideo,
    );
    expect(general?.entries.find((entry) => entry.profileId === 'ana')?.bestContentId).toBe('c-ana-tt-1');
    expect(board(SocialPlatform.Instagram, RankingCategory.BestVideo)).toEqual([['ana', 60, 1]]);
  });

  it('a equipe não entra em nenhum quadro', async () => {
    const { useCase, published } = setup();

    await useCase.publishBoards(null);

    for (const item of published) {
      expect(item.entries.some((entry) => entry.profileId === 'equipe')).toBe(false);
    }
  });
});
