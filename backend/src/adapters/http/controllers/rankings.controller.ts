import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { AppRole, RankingCategory, SocialPlatform } from '../../../domain/types';
import { RankingEntry } from '../../../domain/entities';
import { RankingRepository } from '../../../ports/repositories.port';
import { ClockPort } from '../../../ports/clock.port';
import { INJECTION_TOKENS } from '../../../infrastructure/tokens/injection-tokens';
import { Inject } from '@nestjs/common';
import { CampaignsService } from '../../../application/rankings/campaigns.service';
import { ComputeAndPublishRankingUseCase } from '../../../application/rankings/compute-and-publish.use-case';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Valor do parâmetro `campaign` para pedir o ranking desde o início, sem período. */
const GENERAL = 'geral';
/** Quantas posições acima e abaixo da pessoa aparecem em `view=around`. */
const AROUND = 5;

const PLATFORMS = new Set<string>(Object.values(SocialPlatform));
const CATEGORIES = new Set<string>(Object.values(RankingCategory));
const VIEWS = new Set(['all', 'top3', 'top10', 'top', 'around']);
type RankingView = 'all' | 'top3' | 'top10' | 'top' | 'around';

/** Sem rede, o quadro geral (todas as redes), que é o padrão. */
function parsePlatform(value?: string): SocialPlatform | null {
  if (!value) return null;
  if (!PLATFORMS.has(value)) throw new BadRequestException('Plataforma inválida.');
  return value as SocialPlatform;
}

function parseCategory(value?: string): RankingCategory {
  if (!value) return RankingCategory.TotalViews;
  if (!CATEGORIES.has(value)) throw new BadRequestException('Categoria inválida.');
  return value as RankingCategory;
}

function parseView(value?: string): RankingView {
  if (!value) return 'all';
  if (!VIEWS.has(value)) throw new BadRequestException('Visualização inválida.');
  return value as RankingView;
}

function clampInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Recorte fixo do ranking (sem busca nem página). Null quando a visão é a lista completa. */
function sliceView(entries: RankingEntry[], view: RankingView, me: string): RankingEntry[] | null {
  switch (view) {
    case 'top3':
      return entries.slice(0, 3);
    case 'top10':
    case 'top':
      return entries.slice(0, 10);
    case 'around': {
      const index = entries.findIndex((entry) => entry.profileId === me);
      if (index < 0) return entries.slice(0, 10);
      return entries.slice(Math.max(0, index - AROUND), index + AROUND + 1);
    }
    case 'all':
      return null;
    default: {
      const exhaustive: never = view;
      return exhaustive;
    }
  }
}

/** Ranking geral (todas as redes) por padrão; com `platform`, o quadro só daquela rede. */
@Controller('api/rankings')
@UseGuards(AuthGuard)
export class RankingsController {
  constructor(
    @Inject(INJECTION_TOKENS.CLOCK)
    private readonly clock: ClockPort,
    @Inject(INJECTION_TOKENS.RANKING_REPOSITORY)
    private readonly rankingRepo: RankingRepository,
    private readonly campaigns: CampaignsService,
    private readonly ranking: ComputeAndPublishRankingUseCase,
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
      if (!found) throw new NotFoundException('Essa campanha não existe mais. Escolha outra na lista.');
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
    
    const fullTotal = published.entries.length;
    const sliced = sliceView(published.entries, view, req.user.id);
    let entries = sliced ?? published.entries;
    if (!sliced && searchQuery) {
      const query = searchQuery.toLowerCase();
      entries = entries.filter((e) => e.publicName.toLowerCase().includes(query));
    }

    const total = sliced ? fullTotal : entries.length;
    const offset = sliced ? 0 : (page - 1) * pageSize;
    const paginatedEntries = sliced ? entries : entries.slice(offset, offset + pageSize);
    
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
      let reason: string;
      if (req.user.role === AppRole.Admin) {
        reason = 'Conta da equipe não entra no ranking';
      } else {
        const eligibility = await this.ranking.eligibilityFor(
          req.user.id,
          published.version.staleToleranceHours,
          platform,
        );
        // Elegível agora, mas a publicação é anterior: entra na próxima atualização.
        reason = eligibility.eligible
          ? 'Sua posição aparece na próxima atualização do ranking, em até 10 minutos.'
          : eligibility.reason || 'Fora do ranking no momento';
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
