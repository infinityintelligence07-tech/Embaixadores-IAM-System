import { Controller, Get, Query, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import {
  AccountReviewStatus,
  MembershipStatus,
  RankingCategory,
  SocialPlatform,
} from '../../../domain/types';
import { RankingRepository, MembershipRepository, SocialAccountRepository } from '../../../ports/repositories.port';
import { isEligibleForRanking } from '../../../domain/eligibility';
import { ClockPort } from '../../../ports/clock.port';
import { INJECTION_TOKENS } from '../../../infrastructure/tokens/injection-tokens';
import { Inject } from '@nestjs/common';
import { CampaignsService } from '../../../application/rankings/campaigns.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Valor do parâmetro `campaign` para pedir o ranking desde o início, sem período. */
const GENERAL = 'geral';

const PLATFORMS = new Set<string>(Object.values(SocialPlatform));
const CATEGORIES = new Set<string>(Object.values(RankingCategory));
const VIEWS = new Set(['all', 'top3', 'top10']);

function parsePlatform(value?: string): SocialPlatform {
  if (!value) return SocialPlatform.Instagram;
  if (!PLATFORMS.has(value)) throw new BadRequestException('Plataforma inválida.');
  return value as SocialPlatform;
}

function parseCategory(value?: string): RankingCategory {
  if (!value) return RankingCategory.TotalViews;
  if (!CATEGORIES.has(value)) throw new BadRequestException('Categoria inválida.');
  return value as RankingCategory;
}

function parseView(value?: string): 'all' | 'top3' | 'top10' {
  if (!value) return 'all';
  if (!VIEWS.has(value)) throw new BadRequestException('Visualização inválida.');
  return value as 'all' | 'top3' | 'top10';
}

function clampInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

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
    private readonly campaigns: CampaignsService,
  ) {}

  /** Campanhas e meses que já começaram, mais o geral. `defaultId` é o que abre primeiro. */
  @Get('campaigns')
  async listCampaigns() {
    const now = this.clock.now();
    const all = await this.campaigns.list();
    const started = all.filter((item) => item.startsAt <= now);
    const fallback = this.campaigns.pickDefault(all, now);
    return {
      defaultId: fallback?.id ?? GENERAL,
      items: started.map((item) => this.campaigns.toView(item, now)),
    };
  }

  /** Sem parâmetro, usa a campanha padrão; `geral` pede o ranking sem período. */
  private async resolveCampaign(value?: string): Promise<{ id: string | null }> {
    if (value === GENERAL) return { id: null };
    if (value) {
      if (!UUID.test(value)) throw new BadRequestException('Campanha inválida.');
      const found = await this.campaigns.findById(value);
      if (!found) throw new BadRequestException('Campanha não encontrada.');
      return { id: found.id };
    }
    const now = this.clock.now();
    const fallback = this.campaigns.pickDefault(await this.campaigns.list(), now);
    return { id: fallback?.id ?? null };
  }
  
  @Get()
  async getRankings(
    @Req() req: any,
    @Query('platform') platformParam?: string,
    @Query('category') categoryParam?: string,
    @Query('view') viewParam?: string,
    @Query('q') searchQuery?: string,
    @Query('page') pageParam?: string,
    @Query('pageSize') pageSizeParam?: string,
    @Query('campaign') campaignParam?: string,
  ) {
    const platform = parsePlatform(platformParam);
    const category = parseCategory(categoryParam);
    const view = parseView(viewParam);
    const page = clampInt(pageParam, 1, 1, 10_000);
    const pageSize = clampInt(pageSizeParam, 50, 1, 100);
    const campaign = await this.resolveCampaign(campaignParam);
    
    const published = await this.rankingRepo.findPublished(platform, category, campaign.id);
    
    if (!published) {
      return {
        items: [],
        page,
        pageSize,
        total: 0,
        view,
        category,
        platform,
        campaignId: campaign.id ?? GENERAL,
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
      campaignId: campaign.id ?? GENERAL,
    };
  }
  
  @Get('me')
  async getMyRanking(
    @Req() req: any,
    @Query('platform') platformParam?: string,
    @Query('category') categoryParam?: string,
    @Query('campaign') campaignParam?: string,
  ) {
    const platform = parsePlatform(platformParam);
    const category = parseCategory(categoryParam);
    const campaign = await this.resolveCampaign(campaignParam);
    
    const published = await this.rankingRepo.findPublished(platform, category, campaign.id);
    
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
      
      let reason = 'Fora do ranking no momento';
      
      const teamNote =
        account &&
        (account.reviewStatus === AccountReviewStatus.ChangesRequested ||
          account.reviewStatus === AccountReviewStatus.Rejected);

      if ((!membership || membership.status !== 'approved') && !teamNote) {
        reason = 'Cadastro ainda não aprovado';
      } else if (!membership) {
        reason = 'Cadastro ainda não aprovado';
      } else if (!account) {
        reason = 'Conta não conectada';
      } else {
        const eligibility = isEligibleForRanking({
          // Com recado da equipe na conta, o recado vale mais que o "aguardando aprovação".
          membershipStatus:
            teamNote && membership.status === MembershipStatus.Pending
              ? MembershipStatus.Approved
              : membership.status,
          connectionStatus: account.status,
          reviewStatus: account.reviewStatus,
          reviewNote: account.reviewNote,
          lastSyncedAt: account.lastSyncedAt,
          staleToleranceHours: published.version.staleToleranceHours,
          now: this.clock.now(),
          syncCoverageRatio: account.syncCoverageRatio,
          firstSyncIncomplete: !account.lastSuccessfulSyncAt,
        });
        reason = eligibility.reason || 'Fora do ranking no momento';
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
