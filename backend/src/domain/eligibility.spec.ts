import { describe, it, expect } from 'vitest';
import { isEligibleForRanking } from './eligibility';
import { AccountReviewStatus, MembershipStatus, ConnectionStatus } from './types';

describe('eligibility', () => {
  const baseInput = {
    membershipStatus: MembershipStatus.Approved,
    connectionStatus: ConnectionStatus.Connected,
    reviewStatus: AccountReviewStatus.Approved,
    reviewNote: null,
    lastSyncedAt: new Date(),
    staleToleranceHours: 24,
    now: new Date(),
    syncCoverageRatio: 1.0,
    firstSyncIncomplete: false,
  };
  
  it('returns eligible when all criteria met', () => {
    const result = isEligibleForRanking(baseInput);
    expect(result.eligible).toBe(true);
    expect(result.isStale).toBe(false);
  });
  
  it('rejects suspended membership', () => {
    const result = isEligibleForRanking({
      ...baseInput,
      membershipStatus: MembershipStatus.Suspended,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBeTruthy();
  });
  
  it('keeps an account out until the team approves it', () => {
    const result = isEligibleForRanking({
      ...baseInput,
      reviewStatus: AccountReviewStatus.Pending,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('Conta em análise pela equipe.');
  });

  it('shows the adjustment the team asked for', () => {
    const result = isEligibleForRanking({
      ...baseInput,
      reviewStatus: AccountReviewStatus.ChangesRequested,
      reviewNote: 'Deixe o perfil público',
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Deixe o perfil público');
  });

  it('keeps a rejected account out of the ranking', () => {
    const result = isEligibleForRanking({
      ...baseInput,
      reviewStatus: AccountReviewStatus.Rejected,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('rejects disconnected account', () => {
    const result = isEligibleForRanking({
      ...baseInput,
      connectionStatus: ConnectionStatus.Disconnected,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBeTruthy();
  });
  
  it('rejects incomplete first sync', () => {
    const result = isEligibleForRanking({
      ...baseInput,
      firstSyncIncomplete: true,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBeTruthy();
  });
  
  it('rejects insufficient coverage', () => {
    const result = isEligibleForRanking({
      ...baseInput,
      syncCoverageRatio: 0.5,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBeTruthy();
  });
  
  it('marks as stale when sync age exceeds half tolerance', () => {
    const now = new Date();
    const lastSyncedAt = new Date(now.getTime() - 13 * 60 * 60 * 1000); // 13 hours ago
    
    const result = isEligibleForRanking({
      ...baseInput,
      lastSyncedAt,
      staleToleranceHours: 24,
      now,
    });
    
    expect(result.eligible).toBe(true);
    expect(result.isStale).toBe(true);
  });
  
  it('excludes when beyond stale tolerance', () => {
    const now = new Date();
    const lastSyncedAt = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25 hours ago
    
    const result = isEligibleForRanking({
      ...baseInput,
      lastSyncedAt,
      staleToleranceHours: 24,
      now,
    });
    
    expect(result.eligible).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});
