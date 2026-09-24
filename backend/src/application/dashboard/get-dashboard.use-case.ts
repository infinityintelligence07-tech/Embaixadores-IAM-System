import { Injectable, Inject } from '@nestjs/common';
import { ProfileId, SocialPlatform } from '../../domain/types';
import {
  SocialAccountRepository,
  RankingRepository,
  ContentRepository,
  MetricsRepository,
} from '../../ports/repositories.port';
import { INJECTION_TOKENS } from '../../infrastructure/tokens/injection-tokens';

export interface DashboardSlice {
  platform: SocialPlatform;
  positionTotal: number | null;
  positionBest: number | null;
  totalParticipants: number | null;
  ineligibilityReason: string | null;
  monitoredViewsTotal: number | null;
  bestVideo: {
    id: string;
    title: string | null;
    views: number;
    permalink: string | null;
  } | null;
  officialAccountViews: number | null;
  officialAccountViewsLabel: string;
  contentCount: number;
  lastSyncAt: Date | null;
  connectionStatus: string | null;
  syncCoverageRatio: number | null;
}

export interface DashboardResult {
  slices: DashboardSlice[];
  rankingCriteria: string;
}

@Injectable()
export class GetDashboardUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccountRepo: SocialAccountRepository,
    @Inject(INJECTION_TOKENS.RANKING_REPOSITORY)
    private readonly rankingRepo: RankingRepository,
    @Inject(INJECTION_TOKENS.CONTENT_REPOSITORY)
    private readonly contentRepo: ContentRepository,
    @Inject(INJECTION_TOKENS.METRICS_REPOSITORY)
    private readonly metricsRepo: MetricsRepository,
  ) {}
  
  async execute(profileId: ProfileId): Promise<DashboardResult> {
    const slices: DashboardSlice[] = [];
    
    for (const platform of [SocialPlatform.Instagram, SocialPlatform.TikTok]) {
      const account = await this.socialAccountRepo.findByProfileAndPlatform(
        profileId,
        platform,
      );
      
      if (!account) {
        // Platform not connected
        slices.push({
          platform,
          positionTotal: null,
          positionBest: null,
          totalParticipants: null,
          ineligibilityReason: 'Account not connected',
          monitoredViewsTotal: null,
          bestVideo: null,
          officialAccountViews: null,
          officialAccountViewsLabel: 'Not available',
          contentCount: 0,
          lastSyncAt: null,
          connectionStatus: null,
          syncCoverageRatio: null,
        });
        continue;
      }
      
      // Get rankings
      const totalRanking = await this.rankingRepo.findPublished(
        platform,
        'total_views' as any,
      );
      const bestRanking = await this.rankingRepo.findPublished(
        platform,
        'best_video' as any,
      );
      
      const totalEntry = totalRanking?.entries.find(
        e => e.profileId === profileId,
      );
      const bestEntry = bestRanking?.entries.find(
        e => e.profileId === profileId,
      );
      
      // Get metrics
      const aggregate = await this.metricsRepo.aggregateEligibleMetricsByAccount(
        account.id,
      );
      
      const accountSnapshot = await this.metricsRepo.getLatestAccountSnapshot(
        account.id,
      );
      
      // Get content
      const contents = await this.contentRepo.findEligibleByAccount(account.id);
      const bestContent = contents.sort((a, b) => 
        (b.latestViews || 0) - (a.latestViews || 0)
      )[0];
      
      slices.push({
        platform,
        positionTotal: totalEntry?.position || null,
        positionBest: bestEntry?.position || null,
        totalParticipants: totalRanking?.version.participantCount || null,
        ineligibilityReason: !totalEntry ? 'Not eligible for ranking' : null,
        monitoredViewsTotal: aggregate?.totalViews || null,
        bestVideo: bestContent
          ? {
              id: bestContent.id,
              title: bestContent.title,
              views: bestContent.latestViews || 0,
              permalink: bestContent.permalink,
            }
          : null,
        officialAccountViews: accountSnapshot?.officialViews || null,
        officialAccountViewsLabel:
          accountSnapshot?.definitionLabel || 'Official account views',
        contentCount: contents.length,
        lastSyncAt: account.lastSyncedAt,
        connectionStatus: account.status,
        syncCoverageRatio: account.syncCoverageRatio,
      });
    }
    
    return {
      slices,
      rankingCriteria:
        'Rankings are based on total views across eligible content. Best video considers only the highest-performing single video.',
    };
  }
}
