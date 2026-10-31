import { AccountReviewStatus, ConnectionStatus, MembershipStatus } from './types';

const MS_PER_HOUR = 60 * 60 * 1000;
const MIN_SYNC_COVERAGE_RATIO = 0.99;

export interface AccountEligibilityInput {
  connectionStatus: ConnectionStatus;
  reviewStatus: AccountReviewStatus;
  reviewNote: string | null;
  lastSyncedAt: Date | null;
  syncCoverageRatio: number | null;
  /** True when the account has not finished its first full sync yet. */
  firstSyncIncomplete: boolean;
}

export interface RankingEligibilityResult {
  eligible: boolean;
  reason?: string;
  /** Present when eligible — true if sync age exceeds half the stale tolerance window. */
  isStale?: boolean;
}

/** Por que uma conta aprovada ficou de fora; orienta o recado da pessoa. */
type AccountBlock = 'review' | 'stopped' | 'collecting' | 'outdated';

interface AccountEligibilityResult extends RankingEligibilityResult {
  block?: AccountBlock;
}

/** Uma conta soma no ranking quando a equipe aprovou e a coleta está em dia. */
export function isAccountEligible(
  input: AccountEligibilityInput,
  window: { staleToleranceHours: number; now: Date },
): AccountEligibilityResult {
  if (input.reviewStatus === AccountReviewStatus.Rejected) {
    return {
      eligible: false,
      block: 'review',
      reason: input.reviewNote
        ? `A equipe não aprovou esta conta para a competição: ${input.reviewNote}`
        : 'A equipe não aprovou esta conta para a competição.',
    };
  }

  if (input.reviewStatus === AccountReviewStatus.ChangesRequested) {
    return {
      eligible: false,
      block: 'review',
      reason: input.reviewNote
        ? `A equipe pediu um ajuste nesta conta: ${input.reviewNote}`
        : 'A equipe pediu um ajuste nesta conta antes de liberar o ranking.',
    };
  }

  if (input.reviewStatus !== AccountReviewStatus.Approved) {
    return { eligible: false, block: 'review', reason: 'Conta em análise pela equipe.' };
  }

  // Durante a coleta a conta fica "syncing"; os dados da coleta anterior continuam valendo.
  if (
    input.connectionStatus !== ConnectionStatus.Connected &&
    input.connectionStatus !== ConnectionStatus.Syncing
  ) {
    return {
      eligible: false,
      block: 'stopped',
      reason: 'Conta não conectada ou com autorização inválida.',
    };
  }

  if (input.firstSyncIncomplete) {
    return {
      eligible: false,
      block: 'collecting',
      reason: 'Primeira coleta ainda incompleta. A posição aparece quando ela terminar.',
    };
  }

  const coverageRatio = input.syncCoverageRatio ?? 0;
  if (coverageRatio < MIN_SYNC_COVERAGE_RATIO) {
    return {
      eligible: false,
      block: 'collecting',
      reason: 'A coleta ainda não cobre conteúdo suficiente para classificar.',
    };
  }

  if (input.lastSyncedAt === null) {
    return { eligible: false, block: 'collecting', reason: 'Conta ainda não sincronizada' };
  }

  const ageMs = window.now.getTime() - input.lastSyncedAt.getTime();
  const toleranceMs = window.staleToleranceHours * MS_PER_HOUR;

  if (ageMs > toleranceMs) {
    return {
      eligible: false,
      block: 'outdated',
      reason: 'Dados desatualizados. Sincronize de novo para voltar ao ranking.',
    };
  }

  return { eligible: true, isStale: ageMs > toleranceMs / 2 };
}

export interface ProfileEligibilityInput {
  isAdmin: boolean;
  membershipStatus: MembershipStatus | null;
  accounts: AccountEligibilityInput[];
  staleToleranceHours: number;
  now: Date;
  /** Nome da rede quando o quadro é de uma rede só; ajusta os recados. */
  networkName?: string;
}

export interface ProfileEligibilityResult extends RankingEligibilityResult {
  /** Posições (em `accounts`) das contas que somam no ranking. */
  countedAccounts: number[];
  /** Entre as que somam, as que passaram da metade da tolerância de coleta. */
  staleAccounts: number[];
}

/**
 * A pessoa entra no ranking com pelo menos uma conta aprovada e em dia. Contas não aprovadas
 * ou com a coleta parada ficam de fora da soma sem tirar a pessoa do ranking.
 */
export function isProfileEligibleForRanking(
  input: ProfileEligibilityInput,
): ProfileEligibilityResult {
  const out = (reason: string): ProfileEligibilityResult => ({
    eligible: false,
    reason,
    countedAccounts: [],
    staleAccounts: [],
  });
  const scope = input.networkName ? ` do ${input.networkName}` : '';

  if (input.isAdmin) return out('Conta da equipe não entra no ranking');
  if (input.membershipStatus === MembershipStatus.Suspended) return out('Cadastro suspenso');
  if (input.membershipStatus !== MembershipStatus.Approved) {
    return out('Complete o seu cadastro para entrar no ranking.');
  }
  if (input.accounts.length === 0) {
    return out(`Nenhuma conta${scope} conectada ainda. Adicione o seu @ em Conexões.`);
  }

  const window = { staleToleranceHours: input.staleToleranceHours, now: input.now };
  const results = input.accounts.map((account) => isAccountEligible(account, window));
  const countedAccounts = results.flatMap((result, index) => (result.eligible ? [index] : []));

  if (countedAccounts.length > 0) {
    const staleAccounts = countedAccounts.filter((index) => results[index].isStale);
    return { eligible: true, isStale: staleAccounts.length > 0, countedAccounts, staleAccounts };
  }

  const approved = results.filter(
    (_, index) => input.accounts[index].reviewStatus === AccountReviewStatus.Approved,
  );
  if (approved.length === 0) {
    const adjustmentAsked = input.accounts.some(
      (account) => account.reviewStatus === AccountReviewStatus.ChangesRequested,
    );
    return out(
      adjustmentAsked
        ? `Nenhuma conta${scope} aprovada ainda. A equipe pediu um ajuste, veja o recado em Conexões.`
        : `Nenhuma conta${scope} aprovada ainda.`,
    );
  }
  if (approved.some((result) => result.block === 'collecting')) {
    return out(`Suas contas${scope} ainda estão em coleta.`);
  }
  if (approved.some((result) => result.block === 'outdated')) {
    return out('Dados desatualizados. Sincronize de novo para voltar ao ranking.');
  }
  return out(`A coleta das suas contas aprovadas${scope} parou. Confira em Conexões.`);
}
