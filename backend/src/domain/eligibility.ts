import { ConnectionStatus, MembershipStatus } from './types';

const MS_PER_HOUR = 60 * 60 * 1000;
const MIN_SYNC_COVERAGE_RATIO = 0.99;

export interface RankingEligibilityInput {
  membershipStatus: MembershipStatus;
  connectionStatus: ConnectionStatus;
  lastSyncedAt: Date | null;
  staleToleranceHours: number;
  now: Date;
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

export function isEligibleForRanking(
  input: RankingEligibilityInput,
): RankingEligibilityResult {
  if (input.membershipStatus === MembershipStatus.Suspended) {
    return { eligible: false, reason: 'Cadastro suspenso' };
  }

  if (input.membershipStatus !== MembershipStatus.Approved) {
    return { eligible: false, reason: 'Aguardando aprovação da equipe.' };
  }

  if (input.connectionStatus !== ConnectionStatus.Connected) {
    return {
      eligible: false,
      reason: 'Conta não conectada ou com autorização inválida.',
    };
  }

  if (input.firstSyncIncomplete) {
    return {
      eligible: false,
      reason: 'Primeira coleta ainda incompleta. A posição aparece quando ela terminar.',
    };
  }

  const coverageRatio = input.syncCoverageRatio ?? 0;
  if (coverageRatio < MIN_SYNC_COVERAGE_RATIO) {
    return {
      eligible: false,
      reason: 'A coleta ainda não cobre conteúdo suficiente para classificar.',
    };
  }

  if (input.lastSyncedAt === null) {
    return { eligible: false, reason: 'Conta ainda não sincronizada' };
  }

  const ageMs = input.now.getTime() - input.lastSyncedAt.getTime();
  const toleranceMs = input.staleToleranceHours * MS_PER_HOUR;

  if (ageMs > toleranceMs) {
    return {
      eligible: false,
      reason: 'Dados desatualizados. Sincronize de novo para voltar ao ranking.',
    };
  }

  const isStale = ageMs > toleranceMs / 2;

  return { eligible: true, isStale };
}
