import { RankingCategory } from './types';

export interface RankingCandidate {
  profileId: string;
  publicName: string;
  avatarUrl: string | null;
  totalViews: number;
  bestVideoViews: number;
  bestContentId: string | null;
  approvedAt: Date;
  lastSyncedAt: Date | null;
  isStale: boolean;
}

export interface RankedCandidate extends RankingCandidate {
  position: number;
}

/**
 * Comparator for ranking sort order (higher rank = lower sort index).
 * Returns negative when `a` should appear before `b`.
 */
export function compareRankingCandidates(
  a: RankingCandidate,
  b: RankingCandidate,
  category: RankingCategory,
): number {
  switch (category) {
    case RankingCategory.TotalViews: {
      if (a.totalViews !== b.totalViews) {
        return b.totalViews - a.totalViews;
      }
      if (a.bestVideoViews !== b.bestVideoViews) {
        return b.bestVideoViews - a.bestVideoViews;
      }
      const approvedDiff = a.approvedAt.getTime() - b.approvedAt.getTime();
      if (approvedDiff !== 0) {
        return approvedDiff;
      }
      return a.profileId.localeCompare(b.profileId);
    }
    case RankingCategory.BestVideo: {
      if (a.bestVideoViews !== b.bestVideoViews) {
        return b.bestVideoViews - a.bestVideoViews;
      }
      if (a.totalViews !== b.totalViews) {
        return b.totalViews - a.totalViews;
      }
      const approvedDiff = a.approvedAt.getTime() - b.approvedAt.getTime();
      if (approvedDiff !== 0) {
        return approvedDiff;
      }
      return a.profileId.localeCompare(b.profileId);
    }
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

export interface AccountMetrics {
  totalViews: number;
  bestVideoViews: number;
  bestContentId: string | null;
}

/** A pessoa soma as views de todas as contas; o melhor vídeo é o maior entre elas. */
export function combineAccountMetrics(accounts: readonly AccountMetrics[]): AccountMetrics {
  let combined: AccountMetrics = { totalViews: 0, bestVideoViews: 0, bestContentId: null };
  for (const account of accounts) {
    const best =
      account.bestContentId !== null &&
      (combined.bestContentId === null || account.bestVideoViews > combined.bestVideoViews);
    combined = {
      totalViews: combined.totalViews + account.totalViews,
      bestVideoViews: best ? account.bestVideoViews : combined.bestVideoViews,
      bestContentId: best ? account.bestContentId : combined.bestContentId,
    };
  }
  return combined;
}

/** Assigns sequential positions (1..n) preserving input order. */
export function assignSequentialPositions(
  sortedCandidates: readonly RankingCandidate[],
): RankedCandidate[] {
  return sortedCandidates.map((candidate, index) => ({
    ...candidate,
    position: index + 1,
  }));
}
