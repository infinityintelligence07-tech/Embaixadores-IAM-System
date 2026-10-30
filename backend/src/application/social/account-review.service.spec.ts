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

function setup(accounts: Record<string, { reviewStatus: AccountReviewStatus; reviewNote: string | null }>) {
  const socialAccountRepo = {
    findByProfileAndPlatform: vi.fn(async (_profileId: string, platform: SocialPlatform) => {
      const found = accounts[platform];
      return found
        ? { id: `acc-${platform}`, profileId: PROFILE, platform, username: 'fulano', ...found }
        : null;
    }),
    findById: vi.fn(async (id: string) => ({
      id,
      profileId: PROFILE,
      platform: SocialPlatform.Instagram,
      username: 'fulano',
      ...accounts.instagram,
    })),
    update: vi.fn(async (id: string, input: Record<string, unknown>) => ({ id, ...input })),
  };
  const membershipRepo = {
    findByProfileId: vi.fn().mockResolvedValue({ status: 'approved' }),
    approve: vi.fn(),
  };
  const auditRepo = { append: vi.fn() };
  const service = new AccountReviewService(
    { now: () => new Date('2026-10-30T12:00:00Z') },
    socialAccountRepo as never,
    membershipRepo as never,
    auditRepo as never,
    { notify: vi.fn() } as never,
  );
  return { service, socialAccountRepo, membershipRepo, auditRepo };
}

describe('AccountReviewService.review', () => {
  it('aprovar a conta aprova a pessoa e fecha a candidatura pendente, com auditoria', async () => {
    const { service, membershipRepo, auditRepo } = setup({
      instagram: { reviewStatus: AccountReviewStatus.Pending, reviewNote: null },
    });
    membershipRepo.findByProfileId.mockResolvedValue({ status: 'pending' });
    query.mockResolvedValue({
      rows: [{ id: 'app-1', nome_completo: 'Fulana Silva', email: 'fulana@exemplo.com' }],
    });

    await service.review('acc-instagram' as SocialAccountId, AccountReviewStatus.Approved, '', ADMIN);

    expect(membershipRepo.approve).toHaveBeenCalledWith(PROFILE, ADMIN, expect.any(Date));
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("SET status = 'approved'");
    expect(sql).toContain('reviewed_by = $2');
    expect(sql).toContain("WHERE status = 'pending'");
    expect(sql).toContain('lower(email)');
    expect(params).toEqual([PROFILE, ADMIN]);
    expect(auditRepo.append).toHaveBeenCalledWith({
      actorId: ADMIN,
      action: 'approve_application',
      entityType: 'application',
      entityId: 'app-1',
      metadata: { name: 'Fulana Silva', email: 'fulana@exemplo.com' },
    });
  });

  it('fecha a candidatura pendente mesmo quando a pessoa já estava aprovada', async () => {
    const { service, membershipRepo } = setup({
      instagram: { reviewStatus: AccountReviewStatus.Pending, reviewNote: null },
    });

    await service.review('acc-instagram' as SocialAccountId, AccountReviewStatus.Approved, '', ADMIN);

    expect(membershipRepo.approve).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('sem candidatura pendente não registra aprovação de candidatura', async () => {
    const { service, auditRepo } = setup({
      instagram: { reviewStatus: AccountReviewStatus.Pending, reviewNote: null },
    });

    await service.review('acc-instagram' as SocialAccountId, AccountReviewStatus.Approved, '', ADMIN);

    const actions = auditRepo.append.mock.calls.map(([entry]) => entry.action);
    expect(actions).not.toContain('approve_application');
    expect(actions).toContain('review_account_approved');
  });

  it('pedir ajuste ou reprovar a conta não mexe na candidatura', async () => {
    const { service } = setup({
      instagram: { reviewStatus: AccountReviewStatus.Pending, reviewNote: null },
    });

    await service.review('acc-instagram' as SocialAccountId, AccountReviewStatus.ChangesRequested, 'Deixe o perfil público.', ADMIN);
    await service.review('acc-instagram' as SocialAccountId, AccountReviewStatus.Rejected, 'Conta de outra pessoa.', ADMIN);

    expect(query).not.toHaveBeenCalled();
  });
});

describe('AccountReviewService.approveAllFor', () => {
  it('aprova só as contas pendentes', async () => {
    const { service, socialAccountRepo } = setup({
      instagram: { reviewStatus: AccountReviewStatus.Pending, reviewNote: null },
      tiktok: { reviewStatus: AccountReviewStatus.Rejected, reviewNote: 'Conta de outra pessoa.' },
    });

    expect(await service.approveAllFor(PROFILE, ADMIN)).toBe(1);
    expect(socialAccountRepo.update).toHaveBeenCalledTimes(1);
    expect(socialAccountRepo.update.mock.calls[0][0]).toBe('acc-instagram');
  });

  it('volta as contas reprovadas junto com a candidatura quando ela é aprovada depois', async () => {
    const { service, socialAccountRepo } = setup({
      instagram: { reviewStatus: AccountReviewStatus.Rejected, reviewNote: 'Faltou o WhatsApp.' },
      tiktok: { reviewStatus: AccountReviewStatus.Rejected, reviewNote: 'Conta de outra pessoa.' },
    });

    expect(await service.approveAllFor(PROFILE, ADMIN, 'Faltou o WhatsApp.')).toBe(1);
    expect(socialAccountRepo.update).toHaveBeenCalledWith(
      'acc-instagram',
      expect.objectContaining({ reviewStatus: AccountReviewStatus.Approved }),
    );
    expect(socialAccountRepo.update).not.toHaveBeenCalledWith('acc-tiktok', expect.anything());
  });

  it('vindo da própria candidatura, não aprova candidatura de novo', async () => {
    const { service } = setup({
      instagram: { reviewStatus: AccountReviewStatus.Pending, reviewNote: null },
    });

    await service.approveAllFor(PROFILE, ADMIN, null, { fromApplication: true });

    expect(query).not.toHaveBeenCalled();
  });
});
