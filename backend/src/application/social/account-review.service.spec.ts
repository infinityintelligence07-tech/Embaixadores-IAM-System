import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountReviewService } from './account-review.service';
import { AccountReviewStatus, ProfileId, SocialAccountId, SocialPlatform } from '../../domain/types';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../infrastructure/db/pool', () => ({ getPool: () => ({ query }) }));

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [] });
});

const PROFILE = 'p-1' as ProfileId;
const ADMIN = 'admin-1' as ProfileId;

interface FakeAccount {
  id: string;
  platform: SocialPlatform;
  reviewStatus: AccountReviewStatus;
  reviewNote: string | null;
}

function setup(accounts: FakeAccount[]) {
  const withOwner = (item: FakeAccount) => ({ profileId: PROFILE, username: 'fulano', ...item });
  const socialAccountRepo = {
    findActiveByProfile: vi.fn(async () => accounts.map(withOwner)),
    findById: vi.fn(async (id: string) => {
      const found = accounts.find((item) => item.id === id);
      return found ? withOwner(found) : null;
    }),
    update: vi.fn(async (id: string, input: Record<string, unknown>) => ({ id, ...input })),
  };
  const auditRepo = { append: vi.fn() };
  const notifications = { notify: vi.fn(), supersede: vi.fn() };
  const service = new AccountReviewService(
    { now: () => new Date('2026-10-30T12:00:00Z') },
    socialAccountRepo as never,
    auditRepo as never,
    notifications as never,
  );
  return { service, socialAccountRepo, auditRepo, notifications };
}

const pending = (id: string, platform = SocialPlatform.Instagram): FakeAccount => ({
  id,
  platform,
  reviewStatus: AccountReviewStatus.Pending,
  reviewNote: null,
});

describe('AccountReviewService.review', () => {
  it('aprovar a conta não aprova cadastro nem candidatura, só a conta', async () => {
    const { service, socialAccountRepo, auditRepo } = setup([pending('acc-1')]);

    await service.review('acc-1' as SocialAccountId, AccountReviewStatus.Approved, '', ADMIN);

    expect(query).not.toHaveBeenCalled();
    expect(socialAccountRepo.update).toHaveBeenCalledWith(
      'acc-1',
      expect.objectContaining({ reviewStatus: AccountReviewStatus.Approved, reviewedBy: ADMIN }),
    );
    const actions = auditRepo.append.mock.calls.map(([entry]) => entry.action);
    expect(actions).toEqual(['review_account_approved']);
  });

  it('aprovar uma conta reprovada é permitido', async () => {
    const { service, socialAccountRepo } = setup([
      { id: 'acc-1', platform: SocialPlatform.TikTok, reviewStatus: AccountReviewStatus.Rejected, reviewNote: 'Perfil de outra pessoa.' },
    ]);

    await service.review('acc-1' as SocialAccountId, AccountReviewStatus.Approved, '', ADMIN);

    expect(socialAccountRepo.update).toHaveBeenCalledWith(
      'acc-1',
      expect.objectContaining({ reviewStatus: AccountReviewStatus.Approved, reviewNote: null }),
    );
  });

  it('pedir ajuste ou reprovar exige recado', async () => {
    const { service } = setup([pending('acc-1')]);

    await expect(
      service.review('acc-1' as SocialAccountId, AccountReviewStatus.Rejected, '', ADMIN),
    ).rejects.toThrow('Escreva o que a pessoa precisa saber ou ajustar.');
  });
});

describe('AccountReviewService com várias contas', () => {
  it('reprovar a candidatura reprova todas as contas ativas da pessoa', async () => {
    const { service, socialAccountRepo, notifications } = setup([
      pending('ig-1'),
      pending('ig-2'),
      pending('tt-1', SocialPlatform.TikTok),
    ]);

    await service.rejectAllFor(PROFILE, 'Faltou o WhatsApp.', ADMIN);

    expect(socialAccountRepo.update.mock.calls.map(([id]) => id)).toEqual(['ig-1', 'ig-2', 'tt-1']);
    expect(notifications.notify).toHaveBeenCalledTimes(1);
  });

  it('aprovar a candidatura de novo volta só as contas reprovadas junto com ela', async () => {
    const { service, socialAccountRepo } = setup([
      { id: 'ig-1', platform: SocialPlatform.Instagram, reviewStatus: AccountReviewStatus.Rejected, reviewNote: 'Faltou o WhatsApp.' },
      { id: 'ig-2', platform: SocialPlatform.Instagram, reviewStatus: AccountReviewStatus.Rejected, reviewNote: 'Conta de outra pessoa.' },
      pending('tt-1', SocialPlatform.TikTok),
    ]);

    expect(await service.restoreRejectedWithApplication(PROFILE, 'Faltou o WhatsApp.', ADMIN)).toBe(1);
    expect(socialAccountRepo.update).toHaveBeenCalledTimes(1);
    expect(socialAccountRepo.update).toHaveBeenCalledWith(
      'ig-1',
      expect.objectContaining({ reviewStatus: AccountReviewStatus.Approved }),
    );
  });
});
