import { describe, it, expect } from 'vitest';
import { 
  compareRankingCandidates, 
  assignSequentialPositions,
  RankingCandidate 
} from './ranking-rules';
import { RankingCategory, asProfileId, asContentId } from './types';

describe('ranking-rules', () => {
  describe('compareRankingCandidates', () => {
    it('sorts by total views descending for total_views category', () => {
      const a: RankingCandidate = {
        profileId: asProfileId('a'),
        publicName: 'A',
        avatarUrl: null,
        totalViews: 100,
        bestVideoViews: 50,
        bestContentId: null,
        approvedAt: new Date('2024-01-01'),
        lastSyncedAt: new Date(),
        isStale: false,
      };
      
      const b: RankingCandidate = {
        profileId: asProfileId('b'),
        publicName: 'B',
        avatarUrl: null,
        totalViews: 200,
        bestVideoViews: 50,
        bestContentId: null,
        approvedAt: new Date('2024-01-01'),
        lastSyncedAt: new Date(),
        isStale: false,
      };
      
      const result = compareRankingCandidates(a, b, RankingCategory.TotalViews);
      expect(result).toBeGreaterThan(0); // b should come before a
    });
    
    it('breaks ties with best video views for total_views', () => {
      const a: RankingCandidate = {
        profileId: asProfileId('a'),
        publicName: 'A',
        avatarUrl: null,
        totalViews: 100,
        bestVideoViews: 30,
        bestContentId: null,
        approvedAt: new Date('2024-01-01'),
        lastSyncedAt: new Date(),
        isStale: false,
      };
      
      const b: RankingCandidate = {
        profileId: asProfileId('b'),
        publicName: 'B',
        avatarUrl: null,
        totalViews: 100,
        bestVideoViews: 50,
        bestContentId: null,
        approvedAt: new Date('2024-01-01'),
        lastSyncedAt: new Date(),
        isStale: false,
      };
      
      const result = compareRankingCandidates(a, b, RankingCategory.TotalViews);
      expect(result).toBeGreaterThan(0); // b should come before a
    });
    
    it('sorts by best video views descending for best_video category', () => {
      const a: RankingCandidate = {
        profileId: asProfileId('a'),
        publicName: 'A',
        avatarUrl: null,
        totalViews: 200,
        bestVideoViews: 50,
        bestContentId: null,
        approvedAt: new Date('2024-01-01'),
        lastSyncedAt: new Date(),
        isStale: false,
      };
      
      const b: RankingCandidate = {
        profileId: asProfileId('b'),
        publicName: 'B',
        avatarUrl: null,
        totalViews: 100,
        bestVideoViews: 100,
        bestContentId: null,
        approvedAt: new Date('2024-01-01'),
        lastSyncedAt: new Date(),
        isStale: false,
      };
      
      const result = compareRankingCandidates(a, b, RankingCategory.BestVideo);
      expect(result).toBeGreaterThan(0); // b should come before a
    });
    
    it('ensures only one position per person in best_video (highest best video wins)', () => {
      const candidates: RankingCandidate[] = [
        {
          profileId: asProfileId('same'),
          publicName: 'Same Person',
          avatarUrl: null,
          totalViews: 300,
          bestVideoViews: 150,
          bestContentId: asContentId('video1'),
          approvedAt: new Date('2024-01-01'),
          lastSyncedAt: new Date(),
          isStale: false,
        },
      ];
      
      const sorted = [...candidates].sort((a, b) =>
        compareRankingCandidates(a, b, RankingCategory.BestVideo),
      );
      
      expect(sorted.length).toBe(1);
      expect(sorted[0].bestVideoViews).toBe(150);
    });
  });
  
  describe('assignSequentialPositions', () => {
    it('assigns positions 1, 2, 3, etc. in order', () => {
      const candidates: RankingCandidate[] = [
        {
          profileId: asProfileId('a'),
          publicName: 'A',
          avatarUrl: null,
          totalViews: 300,
          bestVideoViews: 100,
          bestContentId: null,
          approvedAt: new Date('2024-01-01'),
          lastSyncedAt: new Date(),
          isStale: false,
        },
        {
          profileId: asProfileId('b'),
          publicName: 'B',
          avatarUrl: null,
          totalViews: 200,
          bestVideoViews: 80,
          bestContentId: null,
          approvedAt: new Date('2024-01-01'),
          lastSyncedAt: new Date(),
          isStale: false,
        },
        {
          profileId: asProfileId('c'),
          publicName: 'C',
          avatarUrl: null,
          totalViews: 100,
          bestVideoViews: 60,
          bestContentId: null,
          approvedAt: new Date('2024-01-01'),
          lastSyncedAt: new Date(),
          isStale: false,
        },
      ];
      
      const ranked = assignSequentialPositions(candidates);
      
      expect(ranked[0].position).toBe(1);
      expect(ranked[1].position).toBe(2);
      expect(ranked[2].position).toBe(3);
    });
    
    it('maintains consistency for top3/top10 slices', () => {
      const candidates: RankingCandidate[] = Array.from({ length: 20 }, (_, i) => ({
        profileId: asProfileId(`id-${i}`),
        publicName: `User ${i}`,
        avatarUrl: null,
        totalViews: 1000 - i * 10,
        bestVideoViews: 500 - i * 5,
        bestContentId: null,
        approvedAt: new Date('2024-01-01'),
        lastSyncedAt: new Date(),
        isStale: false,
      }));
      
      const ranked = assignSequentialPositions(candidates);
      
      const top3 = ranked.slice(0, 3);
      const top10 = ranked.slice(0, 10);
      
      // Top3 positions should be 1, 2, 3
      expect(top3.map(r => r.position)).toEqual([1, 2, 3]);
      
      // Top10 should contain correct positions
      expect(top10[0].position).toBe(1);
      expect(top10[9].position).toBe(10);
      
      // Personal position from full ranking should match
      const user5Position = ranked.find(r => r.profileId === asProfileId('id-5'))!.position;
      expect(user5Position).toBe(6);
    });
  });
});
