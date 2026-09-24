import { Controller, Get, Query, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { SocialPlatform, RankingCategory } from '../../../domain/types';
import { RankingRepository, MembershipRepository, SocialAccountRepository } from '../../../ports/repositories.port';
import { isEligibleForRanking } from '../../../domain/eligibility';
import { ClockPort } from '../../../ports/clock.port';
import { INJECTION_TOKENS } from '../../../infrastructure/tokens/injection-tokens';
import { Inject } from '@nestjs/common';

@Controller('api/rankings')
@UseGuards(AuthGuard)
export class RankingsController {
  constructor(
    @Inject(INJECTION_TOKENS.CLOCK)
    private readonly clock: ClockPort,
    @Inject(INJECTION_TOKENS.RANKING_REPOSITORY)
    private readonly rankingRepo: RankingRepository,
    @Inject(INJECTION_TOKENS.MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: MembershipRepository,
    @Inject(INJECTION_TOKENS.SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccountRepo: SocialAccountRepository,
  ) {}
  
  @Get()
  async getRankings(
    @Req() req: any,
    @Query('platform') platformParam?: string,
    @Query('category') categoryParam?: string,
    @Query('view') viewParam?: string,
    @Query('q') searchQuery?: string,
    @Query('page') pageParam?: string,
    @Query('pageSize') pageSizeParam?: string,
  ) {
    const platform = (platformParam || 'instagram') as SocialPlatform;
    const category = (categoryParam || 'total_views') as RankingCategory;
    const view = viewParam || 'all';
    const page = parseInt(pageParam || '1', 10);
    const pageSize = parseInt(pageSizeParam || '50', 10);
    
    const published = await this.rankingRepo.findPublished(platform, category);
    
    if (!published) {
      return {
        items: [],
        page,
        pageSize,
        total: 0,
        view,
        category,
        platform,
      };
    }
    
    let entries = published.entries;
    const fullTotal = entries.length;

    // Top 3 / Top 10: recortes do ranking geral (mesma versão), sem busca
    if (view === 'top3') {
      entries = entries.slice(0, 3);
    } else if (view === 'top10') {
      entries = entries.slice(0, 10);
    } else if (searchQuery) {
      const query = searchQuery.toLowerCase();
      entries = entries.filter((e) =>
        e.publicName.toLowerCase().includes(query),
      );
    }

    const total = view === 'all' ? entries.length : fullTotal;
    const offset = view === 'all' ? (page - 1) * pageSize : 0;
    const paginatedEntries =
      view === 'all' ? entries.slice(offset, offset + pageSize) : entries;
    
    return {
      items: paginatedEntries.map(entry => ({
        position: entry.position,
        profileId: entry.profileId,
        publicName: entry.publicName,
        avatarUrl: entry.avatarUrl,
        score: entry.score,
        totalViews: entry.totalViews,
        bestVideoViews: entry.bestVideoViews,
        isStale: entry.isStale,
        isCurrentUser: entry.profileId === req.user.id,
      })),
      page,
      pageSize,
      total,
      view,
      category,
      platform,
    };
  }
  
  @Get('me')
  async getMyRanking(
    @Req() req: any,
    @Query('platform') platformParam?: string,
    @Query('category') categoryParam?: string,
  ) {
    const platform = (platformParam || 'instagram') as SocialPlatform;
    const category = (categoryParam || 'total_views') as RankingCategory;
    
    const published = await this.rankingRepo.findPublished(platform, category);
    
    if (!published) {
      return {
        eligible: false,
        reason: 'Ranking ainda não publicado',
        position: null,
        total: 0,
        score: null,
        gapToAbove: null,
        category,
        platform,
        entry: null,
      };
    }
    
    const myEntry = published.entries.find(e => e.profileId === req.user.id);
    
    if (!myEntry) {
      // Check why not eligible
      const membership = await this.membershipRepo.findByProfileId(req.user.id);
      const account = await this.socialAccountRepo.findByProfileAndPlatform(
        req.user.id,
        platform,
      );
      
      let reason = 'Not eligible for ranking';
      
      if (!membership || membership.status !== 'approved') {
        reason = 'Membership not approved';
      } else if (!account) {
        reason = 'Social account not connected';
      } else {
        const eligibility = isEligibleForRanking({
          membershipStatus: membership.status,
          connectionStatus: account.status,
          lastSyncedAt: account.lastSyncedAt,
          staleToleranceHours: published.version.staleToleranceHours,
          now: this.clock.now(),
          syncCoverageRatio: account.syncCoverageRatio,
          firstSyncIncomplete: !account.lastSuccessfulSyncAt,
        });
        reason = eligibility.reason || 'Not eligible';
      }
      
      return {
        eligible: false,
        reason,
        position: null,
        total: published.entries.length,
        score: null,
        gapToAbove: null,
        category,
        platform,
        entry: null,
      };
    }
    
    // Calculate gap to above
    let gapToAbove: number | null = null;
    if (myEntry.position > 1) {
      const aboveEntry = published.entries[myEntry.position - 2];
      gapToAbove = aboveEntry.score - myEntry.score;
    }
    
    return {
      eligible: true,
      reason: null,
      position: myEntry.position,
      total: published.entries.length,
      score: myEntry.score,
      gapToAbove,
      category,
      platform,
      entry: {
        position: myEntry.position,
        profileId: myEntry.profileId,
        publicName: myEntry.publicName,
        avatarUrl: myEntry.avatarUrl,
        score: myEntry.score,
        totalViews: myEntry.totalViews,
        bestVideoViews: myEntry.bestVideoViews,
        isStale: myEntry.isStale,
        isCurrentUser: true,
      },
    };
  }
}
