import { describe, expect, it, vi } from 'vitest';
import { SyncAccountUseCase } from './sync-account.use-case';
import { SocialAccount, SyncJob } from '../../domain/entities';
import {
  AccountReviewStatus,
  ConnectionStatus,
  ProfileId,
  SocialAccountId,
  SocialPlatform,
  SocialTransport,
  SyncJobId,
  SyncJobStatus,
} from '../../domain/types';
import { SocialProfileNotFoundError } from '../../ports/social-metrics.port';

const NOW = new Date('2026-10-30T12:00:00Z');

function account(overrides: Partial<SocialAccount> = {}): SocialAccount {
  return {
    id: 'acc-1' as SocialAccountId,
    profileId: 'p-1' as ProfileId,
    platform: SocialPlatform.TikTok,
    platformUserId: '999',
    username: 'fulano',
    displayName: 'Fulano',
    avatarUrl: null,
    profileUrl: null,
    status: ConnectionStatus.Connected,
    transport: SocialTransport.PublicApi,
    lastSyncedAt: null,
    lastSuccessfulSyncAt: null,
    syncCoverageRatio: null,
    syncMessage: null,
    verificationCode: null,
    verifiedAt: NOW,
    reviewStatus: AccountReviewStatus.Approved,
    reviewNote: null,
    reviewedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    disconnectedAt: null,
    ...overrides,
  };
}

function job(overrides: Partial<SyncJob> = {}): SyncJob {
  return {
    id: 'job-1' as SyncJobId,
    socialAccountId: 'acc-1' as SocialAccountId,
    jobType: 'full_sync',
    status: SyncJobStatus.Running,
    priority: 100,
    scheduledAt: NOW,
    lockedAt: NOW,
    lockedBy: 'worker-a',
    checkpoint: null,
    attempts: 1,
    maxAttempts: 8,
    nextAttemptAt: null,
    lastError: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function item(id: string) {
  return {
    platformContentId: id,
    title: null,
    thumbnailUrl: null,
    permalink: null,
    publishedAt: NOW,
    mediaType: 'video',
    views: 10,
    viewsAvailable: true,
  };
}

function setup(options: { account?: SocialAccount; jobs?: SyncJob[] } = {}) {
  const current = options.account ?? account();
  const jobs = options.jobs ?? [job()];
  let jobRead = 0;
  const provider = {
    listContents: vi.fn().mockResolvedValue({ items: [item('v1')], nextCursor: null }),
    getAccountMetrics: vi.fn().mockResolvedValue({ officialViews: null, availability: 'unavailable' }),
  };
  const syncJobRepo = {
    findById: vi.fn(async () => jobs[Math.min(jobRead++, jobs.length - 1)]),
    update: vi.fn(),
    createRun: vi.fn().mockResolvedValue({ id: 'run-1' }),
    finishRun: vi.fn(),
  };
  const socialAccountRepo = {
    findById: vi.fn().mockResolvedValue(current),
    update: vi.fn(),
  };
  const contentRepo = {
    upsert: vi.fn(async () => ({ id: '00000000-0000-4000-8000-000000000001' })),
    findEligibleByAccount: vi.fn().mockResolvedValue([]),
    markRemoved: vi.fn(),
  };
  const metricsRepo = {
    getLatestContentSnapshot: vi.fn().mockResolvedValue(null),
    insertContentSnapshot: vi.fn(),
    insertAccountSnapshot: vi.fn(),
  };
  const useCase = new SyncAccountUseCase(
    { now: () => NOW },
    { encrypt: vi.fn(), decrypt: vi.fn() } as never,
    { getProvider: () => provider },
    socialAccountRepo as never,
    syncJobRepo as never,
    contentRepo as never,
    metricsRepo as never,
    { warm: vi.fn() } as never,
  );
  return { useCase, provider, syncJobRepo, socialAccountRepo, contentRepo };
}

describe('SyncAccountUseCase', () => {
  it('para sem gravar nada quando o job é cancelado no meio da coleta', async () => {
    const { useCase, syncJobRepo, socialAccountRepo, contentRepo } = setup({
      jobs: [job(), job({ status: SyncJobStatus.Cancelled })],
    });

    await useCase.execute('job-1');

    expect(contentRepo.upsert).not.toHaveBeenCalled();
    expect(syncJobRepo.finishRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: SyncJobStatus.Cancelled }),
    );
    const jobStatuses = syncJobRepo.update.mock.calls.map(([, input]) => input.status);
    expect(jobStatuses).not.toContain(SyncJobStatus.Pending);
    expect(jobStatuses).not.toContain(SyncJobStatus.Succeeded);
    const accountStatuses = socialAccountRepo.update.mock.calls.map(([, input]) => input.status);
    expect(accountStatuses).not.toContain(ConnectionStatus.Connected);
  });

  it('para quando o @ da conta mudou durante a coleta', async () => {
    const { useCase, socialAccountRepo, contentRepo } = setup();
    socialAccountRepo.findById
      .mockResolvedValueOnce(account())
      .mockResolvedValue(account({ platformUserId: 'outro-id' }));

    await useCase.execute('job-1');

    expect(contentRepo.upsert).not.toHaveBeenCalled();
  });

  it('para quando outro worker reassumiu o job', async () => {
    const { useCase, contentRepo } = setup({ jobs: [job(), job({ lockedBy: 'worker-b' })] });

    await useCase.execute('job-1');

    expect(contentRepo.upsert).not.toHaveBeenCalled();
  });

  it('coleta completa grava os vídeos e marca a conta como conectada', async () => {
    const { useCase, syncJobRepo, socialAccountRepo, contentRepo } = setup();

    await useCase.execute('job-1');

    expect(contentRepo.upsert).toHaveBeenCalledTimes(1);
    expect(syncJobRepo.update).toHaveBeenCalledWith('job-1', { status: SyncJobStatus.Succeeded, lastError: null });
    expect(socialAccountRepo.update).toHaveBeenLastCalledWith(
      'acc-1',
      expect.objectContaining({ status: ConnectionStatus.Connected, syncCoverageRatio: 1 }),
    );
  });

  it('@ não encontrado avisa a pessoa para informar o @ novo', async () => {
    const { useCase, provider, socialAccountRepo, syncJobRepo } = setup();
    provider.listContents.mockRejectedValue(new SocialProfileNotFoundError());

    await expect(useCase.execute('job-1')).rejects.toBeInstanceOf(SocialProfileNotFoundError);

    const message = 'Não encontramos @fulano no TikTok. Se você trocou o @, informe o novo em Conexões.';
    expect(socialAccountRepo.update).toHaveBeenLastCalledWith(
      'acc-1',
      expect.objectContaining({ syncMessage: message }),
    );
    expect(syncJobRepo.update).toHaveBeenLastCalledWith(
      'job-1',
      expect.objectContaining({ status: SyncJobStatus.Pending, lastError: message }),
    );
  });

  it('renova o lock a cada página e para no limite de páginas sem gastar mais créditos', async () => {
    const { useCase, provider, syncJobRepo, socialAccountRepo, contentRepo } = setup({
      account: account({ syncCoverageRatio: 1 }),
    });
    let page = 0;
    provider.listContents.mockImplementation(async () => ({
      items: [item(`v${page}`)],
      nextCursor: `c${++page}`,
    }));

    await useCase.execute('job-1');

    expect(provider.listContents).toHaveBeenCalledTimes(20);
    const checkpointUpdate = syncJobRepo.update.mock.calls.find(([, input]) => input.checkpoint)?.[1];
    expect(checkpointUpdate?.lockedAt).toEqual(NOW);
    expect(syncJobRepo.update).toHaveBeenLastCalledWith('job-1', { status: SyncJobStatus.Succeeded, lastError: null });
    expect(socialAccountRepo.update).toHaveBeenLastCalledWith(
      'acc-1',
      expect.objectContaining({ syncCoverageRatio: 1 }),
    );
    // Sem ler o perfil até o fim, vídeo nenhum é marcado como removido.
    expect(contentRepo.markRemoved).not.toHaveBeenCalled();
  });

  it('depois do limite de rodadas, trata a conta grande como completa', async () => {
    const { useCase, provider, syncJobRepo, socialAccountRepo } = setup({
      jobs: [job({ checkpoint: { cursor: 'c500', totalFetched: 500, continuations: 5 } })],
    });
    let page = 500;
    provider.listContents.mockImplementation(async () => ({
      items: [item(`v${page}`)],
      nextCursor: `c${++page}`,
    }));

    await useCase.execute('job-1');

    expect(syncJobRepo.update).toHaveBeenLastCalledWith('job-1', { status: SyncJobStatus.Succeeded, lastError: null });
    expect(socialAccountRepo.update).toHaveBeenLastCalledWith(
      'acc-1',
      expect.objectContaining({ syncCoverageRatio: 1 }),
    );
  });
});
