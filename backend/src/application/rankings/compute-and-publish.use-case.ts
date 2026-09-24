import { Injectable, Inject, Logger } from '@nestjs/common';
import { SocialPlatform, RankingCategory, ProfileId } from '../../domain/types';
import {
  RankingRepository,
  MembershipRepository,
  SocialAccountRepository,
  MetricsRepository,
  ProfileRepository,
  SettingsRepository,
  PublishRankingEntryInput,
} from '../../ports/repositories.port';
import { ClockPort } from '../../ports/clock.port';
import { INJECTION_TOKENS } from '../../infrastructure/tokens/injection-tokens';
import { isEligibleForRanking } from '../../domain/eligibility';
import { compareRankingCandidates, assignSequentialPositions, RankingCandidate } from '../../domain/ranking-rules';

@Injectable()
export class ComputeAndPublishRankingUseCase {
  private readonly logger = new Logger(ComputeAndPublishRankingUseCase.name);
  
  constructor(
    @Inject(INJECTION_TOKENS.CLOCK)
    private readonly clock: ClockPort,
    @Inject(INJECTION_TOKENS.RANKING_REPOSITORY)
    private readonly rankingRepo: RankingRepository,
    @Inject(INJECTION_TOKENS.MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: MembershipRepository,
    @Inject(INJECTION_TOKENS.SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccountRepo: SocialAccountRepository,
    @Inject(INJECTION_TOKENS.METRICS_REPOSITORY)
    private readonly metricsRepo: MetricsRepository,
    @Inject(INJECTION_TOKENS.PROFILE_REPOSITORY)
    private readonly profileRepo: ProfileRepository,
    @Inject(INJECTION_TOKENS.SETTINGS_REPOSITORY)
    private readonly settingsRepo: SettingsRepository,
  ) {}
  
  async execute(platform: SocialPlatform, category: RankingCategory): Promise<void> {
    const now = this.clock.now();
    
    // Get stale tolerance from settings
    const staleToleranceHours = await this.settingsRepo.getNumber(
      'stale_tolerance_hours',
      24,
    );
    
    this.logger.log(
      `Computing ${category} ranking for ${platform} (stale tolerance: ${staleToleranceHours}h)`,
    );
    
    // Get all approved memberships
    const memberships = await this.membershipRepo.findApproved();
    
    const candidates: RankingCandidate[] = [];
    
    for (const membership of memberships) {
      const account = await this.socialAccountRepo.findByProfileAndPlatform(
        membership.profileId,
        platform,
      );
      
      if (!account) {
        continue;
      }
      
      // Check if first sync is incomplete
      const latestRun = await this.metricsRepo.getLatestAccountSnapshot(account.id);
      const firstSyncIncomplete = !latestRun && !account.lastSuccessfulSyncAt;
      
      // Check eligibility
      const eligibility = isEligibleForRanking({
        membershipStatus: membership.status,
        connectionStatus: account.status,
        lastSyncedAt: account.lastSyncedAt,
        staleToleranceHours,
        now,
        syncCoverageRatio: account.syncCoverageRatio,
        firstSyncIncomplete,
      });
      
      if (!eligibility.eligible) {
        this.logger.debug(
          `Profile ${membership.profileId} ineligible: ${eligibility.reason}`,
        );
        continue;
      }
      
      // Get metrics
      const aggregate = await this.metricsRepo.aggregateEligibleMetricsByAccount(
        account.id,
      );
      
      if (!aggregate) {
        continue;
      }
      
      const profile = await this.profileRepo.findById(membership.profileId);
      if (!profile) {
        continue;
      }
      
      candidates.push({
        profileId: membership.profileId,
        publicName: profile.publicName,
        avatarUrl: profile.avatarUrl,
        totalViews: aggregate.totalViews,
        bestVideoViews: aggregate.bestVideoViews,
        bestContentId: aggregate.bestContentId,
        approvedAt: membership.approvedAt!,
        lastSyncedAt: account.lastSyncedAt,
        isStale: eligibility.isStale || false,
      });
    }
    
    this.logger.log(`Found ${candidates.length} eligible candidates`);
    
    // Sort candidates
    const sorted = [...candidates].sort((a, b) =>
      compareRankingCandidates(a, b, category),
    );
    
    // Assign positions
    const ranked = assignSequentialPositions(sorted);
    
    // Calculate scores (based on position for simplicity)
    const entries: PublishRankingEntryInput[] = ranked.map(candidate => ({
      position: candidate.position,
      profileId: candidate.profileId as any,
      publicName: candidate.publicName,
      avatarUrl: candidate.avatarUrl,
      totalViews: candidate.totalViews,
      bestVideoViews: candidate.bestVideoViews,
      bestContentId: candidate.bestContentId as any,
      score: category === RankingCategory.TotalViews 
        ? candidate.totalViews 
        : candidate.bestVideoViews,
      lastSyncedAt: candidate.lastSyncedAt,
      isStale: candidate.isStale,
    }));
    
    // Publish atomically
    const result = await this.rankingRepo.publishAtomic({
      platform,
      category,
      staleToleranceHours,
      computedAt: now,
      entries,
    });
    
    this.logger.log(
      `Published ranking ${result.version.id} with ${entries.length} entries`,
    );
  }
}
