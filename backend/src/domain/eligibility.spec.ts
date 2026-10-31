import { describe, it, expect } from 'vitest';
import { isAccountEligible, isProfileEligibleForRanking } from './eligibility';
import { AccountReviewStatus, MembershipStatus, ConnectionStatus } from './types';

const now = new Date('2026-10-30T12:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);
const window = { staleToleranceHours: 24, now };

const approvedAccount = {
  connectionStatus: ConnectionStatus.Connected,
  reviewStatus: AccountReviewStatus.Approved,
  reviewNote: null,
  lastSyncedAt: hoursAgo(1),
  syncCoverageRatio: 1.0,
  firstSyncIncomplete: false,
};

const person = {
  isAdmin: false,
  membershipStatus: MembershipStatus.Approved,
  accounts: [approvedAccount],
  staleToleranceHours: 24,
  now,
};

describe('isAccountEligible', () => {
  it('conta aprovada e em dia soma', () => {
    const result = isAccountEligible(approvedAccount, window);
    expect(result.eligible).toBe(true);
    expect(result.isStale).toBe(false);
  });

  it('conta em análise, com ajuste pedido ou reprovada não soma', () => {
    expect(isAccountEligible({ ...approvedAccount, reviewStatus: AccountReviewStatus.Pending }, window).reason).toBe(
      'Conta em análise pela equipe.',
    );
    expect(
      isAccountEligible(
        { ...approvedAccount, reviewStatus: AccountReviewStatus.ChangesRequested, reviewNote: 'Deixe o perfil público' },
        window,
      ).reason,
    ).toContain('Deixe o perfil público');
    expect(isAccountEligible({ ...approvedAccount, reviewStatus: AccountReviewStatus.Rejected }, window).eligible).toBe(false);
  });

  it('continua somando enquanto a próxima coleta roda', () => {
    expect(isAccountEligible({ ...approvedAccount, connectionStatus: ConnectionStatus.Syncing }, window).eligible).toBe(true);
  });

  it('desconectada, expirada ou aguardando confirmação não soma', () => {
    for (const connectionStatus of [
      ConnectionStatus.Disconnected,
      ConnectionStatus.AuthorizationExpired,
      ConnectionStatus.PendingVerification,
    ]) {
      expect(isAccountEligible({ ...approvedAccount, connectionStatus }, window).eligible).toBe(false);
    }
  });

  it('primeira coleta incompleta ou cobertura baixa não soma', () => {
    expect(isAccountEligible({ ...approvedAccount, firstSyncIncomplete: true }, window).eligible).toBe(false);
    expect(isAccountEligible({ ...approvedAccount, syncCoverageRatio: 0.5 }, window).eligible).toBe(false);
  });

  it('marca como desatualizada depois da metade da tolerância e tira depois dela', () => {
    expect(isAccountEligible({ ...approvedAccount, lastSyncedAt: hoursAgo(13) }, window)).toEqual({
      eligible: true,
      isStale: true,
    });
    expect(isAccountEligible({ ...approvedAccount, lastSyncedAt: hoursAgo(25) }, window).eligible).toBe(false);
  });
});

describe('isProfileEligibleForRanking', () => {
  it('pessoa com uma conta aprovada e em dia entra', () => {
    const result = isProfileEligibleForRanking(person);
    expect(result.eligible).toBe(true);
    expect(result.countedAccounts).toEqual([0]);
  });

  it('sem conta aprovada fica de fora com recado em português', () => {
    const result = isProfileEligibleForRanking({
      ...person,
      accounts: [
        { ...approvedAccount, reviewStatus: AccountReviewStatus.Pending },
        { ...approvedAccount, reviewStatus: AccountReviewStatus.Rejected },
      ],
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('Nenhuma conta aprovada ainda.');
    expect(result.countedAccounts).toEqual([]);
  });

  it('ajuste pedido aparece no recado de quem ainda não tem conta aprovada', () => {
    const result = isProfileEligibleForRanking({
      ...person,
      accounts: [{ ...approvedAccount, reviewStatus: AccountReviewStatus.ChangesRequested }],
    });
    expect(result.reason).toMatch(/^Nenhuma conta aprovada ainda\. A equipe pediu um ajuste/);
  });

  it('sem nenhuma conta, pede para adicionar o @', () => {
    const result = isProfileEligibleForRanking({ ...person, accounts: [] });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('Nenhuma conta conectada ainda. Adicione o seu @ em Conexões.');
  });

  it('no quadro de uma rede, o recado cita a rede', () => {
    const result = isProfileEligibleForRanking({ ...person, accounts: [], networkName: 'TikTok' });
    expect(result.reason).toBe('Nenhuma conta do TikTok conectada ainda. Adicione o seu @ em Conexões.');
  });

  it('contas aprovadas ainda em coleta', () => {
    const result = isProfileEligibleForRanking({
      ...person,
      accounts: [{ ...approvedAccount, firstSyncIncomplete: true }],
    });
    expect(result.reason).toBe('Suas contas ainda estão em coleta.');
  });

  it('só as contas aprovadas e em dia somam; as outras não tiram a pessoa do ranking', () => {
    const result = isProfileEligibleForRanking({
      ...person,
      accounts: [
        { ...approvedAccount, reviewStatus: AccountReviewStatus.Pending },
        approvedAccount,
        { ...approvedAccount, connectionStatus: ConnectionStatus.Disconnected },
        { ...approvedAccount, lastSyncedAt: hoursAgo(13) },
      ],
    });
    expect(result.eligible).toBe(true);
    expect(result.countedAccounts).toEqual([1, 3]);
    expect(result.staleAccounts).toEqual([3]);
    expect(result.isStale).toBe(true);
  });

  it('equipe, suspensos e cadastro incompleto ficam de fora mesmo com conta aprovada', () => {
    expect(isProfileEligibleForRanking({ ...person, isAdmin: true }).reason).toBe(
      'Conta da equipe não entra no ranking',
    );
    expect(
      isProfileEligibleForRanking({ ...person, membershipStatus: MembershipStatus.Suspended }).reason,
    ).toBe('Cadastro suspenso');
    expect(isProfileEligibleForRanking({ ...person, membershipStatus: null }).eligible).toBe(false);
  });
});
