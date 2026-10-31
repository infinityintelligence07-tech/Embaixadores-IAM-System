import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationsService } from './applications.service';
import { MembershipStatus, ProfileId } from '../../domain/types';

const query = vi.hoisted(() => vi.fn());
const createUser = vi.hoisted(() => vi.fn());
const deleteUser = vi.hoisted(() => vi.fn());

vi.mock('../../infrastructure/db/pool', () => ({ getPool: () => ({ query }) }));
vi.mock('../../infrastructure/config/env', () => ({
  loadConfig: () => ({ supabase: { url: 'https://example.supabase.co', serviceRoleKey: 'service' } }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { admin: { createUser, deleteUser } } }),
}));

const NOW = new Date('2026-10-31T12:00:00Z');
const USER = 'user-1' as ProfileId;

function setup(membershipStatus: MembershipStatus | null = MembershipStatus.Pending) {
  const membershipRepo = {
    findByProfileId: vi.fn(async () => (membershipStatus ? { status: membershipStatus } : null)),
    approve: vi.fn(),
  };
  const service = new ApplicationsService(
    { now: () => NOW },
    membershipRepo as never,
    {} as never,
    { notify: vi.fn() } as never,
  );
  return { service, membershipRepo };
}

function insertCall() {
  return query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO applications'));
}

beforeEach(() => {
  query.mockReset();
  query.mockImplementation(async (sql: string) =>
    String(sql).includes('INSERT INTO applications') ? { rows: [{ id: 'app-1' }] } : { rows: [] },
  );
  createUser.mockReset();
  createUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
  deleteUser.mockReset();
});

describe('ApplicationsService.submit', () => {
  const body = {
    nome_completo: 'Fulana  Silva',
    email: 'Fulana@Exemplo.com',
    whatsapp: '(11) 98765-4321',
    password: 'senha-forte-1',
    ranking_consent: true,
  };

  it('cria a pessoa com participação aprovada e cadastro aprovado sem redes', async () => {
    const { service, membershipRepo } = setup();

    await expect(service.submit(body)).resolves.toEqual({ id: 'app-1', accountCreated: true });

    expect(membershipRepo.approve).toHaveBeenCalledWith(USER, null, NOW);
    const [sql, params] = insertCall()!;
    expect(sql).toContain("'approved'");
    expect(sql).toContain("'{}'");
    expect(params).toEqual(['Fulana Silva', 'fulana@exemplo.com', '11987654321', USER]);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('não pede rede nem @', async () => {
    const { service } = setup();

    await expect(service.submit(body)).resolves.toBeTruthy();
    expect(createUser).toHaveBeenCalledTimes(1);
  });
});

describe('ApplicationsService.completeSignup', () => {
  const profile = { id: USER, email: 'fulana@gmail.com', fullName: 'Fulana' };

  it('quem entra pelo Google completa WhatsApp e consentimento e já participa', async () => {
    const { service, membershipRepo } = setup();

    await expect(
      service.completeSignup(profile, { whatsapp: '11987654321', ranking_consent: true }),
    ).resolves.toEqual({ id: 'app-1' });

    expect(membershipRepo.approve).toHaveBeenCalledWith(USER, null, NOW);
    expect(insertCall()![1]).toEqual(['Fulana', 'fulana@gmail.com', '11987654321', USER]);
  });

  it('quem a equipe suspendeu continua suspenso', async () => {
    const { service, membershipRepo } = setup(MembershipStatus.Suspended);

    await service.completeSignup(profile, { whatsapp: '11987654321', ranking_consent: true });

    expect(membershipRepo.approve).not.toHaveBeenCalled();
  });
});
