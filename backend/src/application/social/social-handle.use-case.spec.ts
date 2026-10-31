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
    countActiveByProfileAndPlatform: vi.fn().mockResolvedValue(0),
    create: vi.fn(async (input: Partial<SocialAccount>) => account({ id: 'acc-new' as SocialAccountId, ...input })),
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
  const tiktokLookup = {
    ...lookup,
    platform: 'tiktok' as const,
    lookupProfile: vi.fn().mockResolvedValue({
      platformUserId: 'tt-9',
      username: 'fulano_tt',
      displayName: 'Fulano',
      avatarUrl: null,
      profileUrl: 'https://www.tiktok.com/@fulano_tt',
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
    [lookup, tiktokLookup],
  );
  return { useCase, socialAccountRepo, syncJobRepo, lookup };
}

describe('SocialHandleUseCase.claim', () => {
  it('dois pedidos simultâneos do mesmo @ devolvem a conta já gravada', async () => {
    const { useCase, socialAccountRepo } = setup();
    const saved = account();
    socialAccountRepo.findAnyByPlatformUserId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(saved);
    socialAccountRepo.create.mockRejectedValue(uniqueViolation());

    await expect(useCase.claim(ME, SocialPlatform.Instagram, '@fulano')).resolves.toBe(saved);
  });

  it('o mesmo @ gravado por outra pessoa no meio do caminho vira 409 em português', async () => {
    const { useCase, socialAccountRepo } = setup();
    socialAccountRepo.findAnyByPlatformUserId
      .mockResolvedValueOnce(null)
      .mockResolvedValue(account({ profileId: OTHER }));
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

  it('o mesmo @ já ativo devolve a conta existente, sem duplicar nem contar vaga', async () => {
    const { useCase, socialAccountRepo, syncJobRepo } = setup();
    socialAccountRepo.findAnyByPlatformUserId.mockResolvedValue(account());
    socialAccountRepo.countActiveByProfileAndPlatform.mockResolvedValue(5);

    const result = await useCase.claim(ME, SocialPlatform.Instagram, '@fulano');

    expect(result.id).toBe('acc-1');
    expect(socialAccountRepo.create).not.toHaveBeenCalled();
    expect(socialAccountRepo.countActiveByProfileAndPlatform).not.toHaveBeenCalled();
    expect(syncJobRepo.enqueue).not.toHaveBeenCalled();
    expect(socialAccountRepo.update).toHaveBeenCalledTimes(1);
    expect(socialAccountRepo.update.mock.calls[0][1]).not.toHaveProperty('status');
  });

  it('a mesma conta com a coleta parada volta a conectada e coleta de novo, sem perder a análise', async () => {
    const { useCase, socialAccountRepo, syncJobRepo } = setup();
    socialAccountRepo.findAnyByPlatformUserId.mockResolvedValue(
      account({
        status: ConnectionStatus.InsufficientPermission,
        reviewStatus: AccountReviewStatus.Approved,
      }),
    );

    await useCase.claim(ME, SocialPlatform.Instagram, '@fulano');

    const input = socialAccountRepo.update.mock.calls[0][1];
    expect(input.status).toBe(ConnectionStatus.Connected);
    expect(input).not.toHaveProperty('reviewStatus');
    expect(socialAccountRepo.create).not.toHaveBeenCalled();
    expect(syncJobRepo.enqueue).toHaveBeenCalledWith({ socialAccountId: 'acc-1', priority: 200 });
  });

  it('um @ novo vira mais uma conta, pendente e na fila de coleta, sem mexer nas outras', async () => {
    const { useCase, socialAccountRepo, syncJobRepo } = setup();
    socialAccountRepo.countActiveByProfileAndPlatform.mockResolvedValue(2);

    const result = await useCase.claim(ME, SocialPlatform.Instagram, '@fulano');

    expect(socialAccountRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: ME, platform: SocialPlatform.Instagram, platformUserId: '123' }),
    );
    expect(result.reviewStatus).toBe(AccountReviewStatus.Pending);
    expect(result.status).toBe(ConnectionStatus.Connected);
    expect(socialAccountRepo.update.mock.calls.every(([id]) => id === 'acc-new')).toBe(true);
    expect(syncJobRepo.enqueue).toHaveBeenCalledWith({ socialAccountId: 'acc-new', priority: 200 });
  });

  it('recusa a sexta conta ativa no Instagram com o recado do limite', async () => {
    const { useCase, socialAccountRepo } = setup();
    socialAccountRepo.countActiveByProfileAndPlatform.mockResolvedValue(5);

    const error = await useCase.claim(ME, SocialPlatform.Instagram, '@fulano').catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toBe('Você já tem 5 contas no Instagram. Remova uma para adicionar outra.');
    expect(socialAccountRepo.countActiveByProfileAndPlatform).toHaveBeenCalledWith(ME, SocialPlatform.Instagram);
    expect(socialAccountRepo.create).not.toHaveBeenCalled();
  });

  it('o limite vale por rede: o TikTok tem as próprias 5 vagas e o mesmo recado', async () => {
    const { useCase, socialAccountRepo } = setup();
    socialAccountRepo.countActiveByProfileAndPlatform.mockImplementation(
      async (_profileId: string, platform: SocialPlatform) => (platform === SocialPlatform.TikTok ? 5 : 0),
    );

    await expect(useCase.claim(ME, SocialPlatform.TikTok, '@fulano_tt')).rejects.toThrow(
      'Você já tem 5 contas no TikTok. Remova uma para adicionar outra.',
    );
    await expect(useCase.claim(ME, SocialPlatform.Instagram, '@fulano')).resolves.toBeTruthy();
  });

  it('readicionar uma conta removida antes também ocupa vaga', async () => {
    const { useCase, socialAccountRepo } = setup();
    socialAccountRepo.findAnyByPlatformUserId.mockResolvedValue(account({ disconnectedAt: NOW }));
    socialAccountRepo.countActiveByProfileAndPlatform.mockResolvedValue(5);

    await expect(useCase.claim(ME, SocialPlatform.Instagram, '@fulano')).rejects.toThrow(/5 contas/);
    expect(socialAccountRepo.update).not.toHaveBeenCalled();
  });

  it('não engole erros que não são de duplicidade', async () => {
    const { useCase, socialAccountRepo } = setup();
    socialAccountRepo.create.mockRejectedValue(new Error('connection reset'));

    await expect(useCase.claim(ME, SocialPlatform.Instagram, '@fulano')).rejects.toThrow('connection reset');
  });
});
