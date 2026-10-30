import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { SocialHandleUseCase } from './social-handle.use-case';
import { SocialAccount } from '../../domain/entities';
import {
  AccountReviewStatus,
  ConnectionStatus,
  ProfileId,
  SocialAccountId,
  SocialPlatform,
  SocialTransport,
} from '../../domain/types';

const NOW = new Date('2026-10-30T12:00:00Z');
const ME = 'me-profile' as ProfileId;
const OTHER = 'other-profile' as ProfileId;

function account(overrides: Partial<SocialAccount> = {}): SocialAccount {
  return {
    id: 'acc-1' as SocialAccountId,
    profileId: ME,
    platform: SocialPlatform.Instagram,
    platformUserId: '123',
    username: 'fulano',
    displayName: 'Fulano',
    avatarUrl: null,
    profileUrl: 'https://www.instagram.com/fulano/',
    status: ConnectionStatus.Connected,
    transport: SocialTransport.PublicApi,
    lastSyncedAt: null,
    lastSuccessfulSyncAt: null,
    syncCoverageRatio: null,
    syncMessage: null,
    verificationCode: null,
    verifiedAt: NOW,
    reviewStatus: AccountReviewStatus.Pending,
    reviewNote: null,
    reviewedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    disconnectedAt: null,
    ...overrides,
  };
}

function uniqueViolation(): Error {
  return Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
}

function setup() {
  const socialAccountRepo = {
    findAnyByPlatformUserId: vi.fn().mockResolvedValue(null),
    findAnyByProfileAndPlatform: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(async (id: string, input: Partial<SocialAccount>) => account({ id: id as SocialAccountId, ...input })),
    deleteCredentials: vi.fn(),
  };
  const syncJobRepo = { enqueue: vi.fn(), cancelActiveForAccount: vi.fn() };
  const contentRepo = { findEligibleByAccount: vi.fn().mockResolvedValue([]), markRemoved: vi.fn() };
  const auditRepo = { append: vi.fn() };
  const lookup = {
    platform: 'instagram' as const,
    enabled: true,
    lookupProfile: vi.fn().mockResolvedValue({
      platformUserId: '123',
      username: 'fulano',
      displayName: 'Fulano',
      avatarUrl: null,
      profileUrl: 'https://www.instagram.com/fulano/',
      bio: '',
      isPrivate: false,
      aliasUserIds: [],
    }),
  };
  const useCase = new SocialHandleUseCase(
    { now: () => NOW },
    socialAccountRepo as never,
    syncJobRepo as never,
    contentRepo as never,
    auditRepo as never,
    [lookup],
  );
  return { useCase, socialAccountRepo, syncJobRepo, lookup };
}

describe('SocialHandleUseCase.claim', () => {
  it('dois pedidos simultâneos da mesma pessoa devolvem a conta já gravada', async () => {
    const { useCase, socialAccountRepo } = setup();
    const saved = account();
    socialAccountRepo.findAnyByProfileAndPlatform
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(saved);
    socialAccountRepo.create.mockRejectedValue(uniqueViolation());

    await expect(useCase.claim(ME, SocialPlatform.Instagram, '@fulano')).resolves.toBe(saved);
  });

  it('o mesmo @ gravado por outra pessoa no meio do caminho vira 409 em português', async () => {
    const { useCase, socialAccountRepo } = setup();
    socialAccountRepo.findAnyByPlatformUserId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(account({ profileId: OTHER }));
    socialAccountRepo.create.mockRejectedValue(uniqueViolation());

    const error = await useCase.claim(ME, SocialPlatform.Instagram, '@fulano').catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toMatch(/outro embaixador/);
  });

  it('recusa um @ que outra pessoa já usa', async () => {
    const { useCase, socialAccountRepo } = setup();
    socialAccountRepo.findAnyByPlatformUserId.mockResolvedValue(account({ profileId: OTHER }));

    await expect(useCase.claim(ME, SocialPlatform.Instagram, 'fulano')).rejects.toThrow(
      'Esse @ já está conectado a outro embaixador. Se ele é seu, fale com a equipe.',
    );
  });

  it('a mesma conta em coleta só atualiza nome e foto', async () => {
    const { useCase, socialAccountRepo, syncJobRepo } = setup();
    socialAccountRepo.findAnyByProfileAndPlatform.mockResolvedValue(account());

    await useCase.claim(ME, SocialPlatform.Instagram, '@fulano');

    expect(syncJobRepo.enqueue).not.toHaveBeenCalled();
    expect(socialAccountRepo.update).toHaveBeenCalledTimes(1);
    expect(socialAccountRepo.update.mock.calls[0][1]).not.toHaveProperty('status');
  });

  it('a mesma conta com a coleta parada volta a conectada e coleta de novo, sem perder a análise', async () => {
    const { useCase, socialAccountRepo, syncJobRepo } = setup();
    socialAccountRepo.findAnyByProfileAndPlatform.mockResolvedValue(
      account({
        status: ConnectionStatus.InsufficientPermission,
        reviewStatus: AccountReviewStatus.Approved,
      }),
    );

    await useCase.claim(ME, SocialPlatform.Instagram, '@fulano');

    const input = socialAccountRepo.update.mock.calls[0][1];
    expect(input.status).toBe(ConnectionStatus.Connected);
    expect(input).not.toHaveProperty('reviewStatus');
    expect(syncJobRepo.enqueue).toHaveBeenCalledWith({ socialAccountId: 'acc-1', priority: 200 });
  });

  it('não engole erros que não são de duplicidade', async () => {
    const { useCase, socialAccountRepo } = setup();
    socialAccountRepo.create.mockRejectedValue(new Error('connection reset'));

    await expect(useCase.claim(ME, SocialPlatform.Instagram, '@fulano')).rejects.toThrow('connection reset');
  });
});
