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

/** Assigns sequential positions (1..n) preserving input order. */
export function assignSequentialPositions(
  sortedCandidates: readonly RankingCandidate[],
): RankedCandidate[] {
  return sortedCandidates.map((candidate, index) => ({
    ...candidate,
    position: index + 1,
  }));
}
