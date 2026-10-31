import { Controller, Get, UseGuards, Req, Inject, Query } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { SocialPlatform } from '../../../domain/types';
import {
  SocialAccountRepository,
  ContentRepository,
  MetricsRepository,
} from '../../../ports/repositories.port';
import { INJECTION_TOKENS } from '../../../infrastructure/tokens/injection-tokens';
import { countsTowardRanking } from '../../../domain/ranked-media';
import { CampaignsService } from '../../../application/rankings/campaigns.service';
import { thumbnailPath } from './media.controller';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('api')
@UseGuards(AuthGuard)
export class ContentsController {
  constructor(
    @Inject(INJECTION_TOKENS.SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccountRepo: SocialAccountRepository,
    @Inject(INJECTION_TOKENS.CONTENT_REPOSITORY)
    private readonly contentRepo: ContentRepository,
    @Inject(INJECTION_TOKENS.METRICS_REPOSITORY)
    private readonly metricsRepo: MetricsRepository,
    private readonly campaigns: CampaignsService,
  ) {}

  /** Com `campaignId`, cada vídeo traz só as views ganhas no período, como no ranking dele. */
  @Get('contents')
  async listContents(@Req() req: any, @Query('campaignId') campaignId?: string) {
    const campaign =
      campaignId && UUID.test(campaignId) ? await this.campaigns.findById(campaignId) : null;
    const window = campaign ? { from: campaign.startsAt, to: campaign.endsAt } : null;
    const allContents: any[] = [];

    for (const platform of [SocialPlatform.Instagram, SocialPlatform.TikTok]) {
      const account = await this.socialAccountRepo.findByProfileAndPlatform(
        req.user.id,
        platform,
      );

      if (!account) {
        continue;
      }

      const gained = window
        ? await this.metricsRepo.gainedViewsByContent(account.id, window)
        : null;
      const contents = (await this.contentRepo.findEligibleByAccount(account.id)).filter(
        (content) =>
          countsTowardRanking(platform, content.mediaType) && (!gained || gained.has(content.id)),
      );

      for (const content of contents) {
        allContents.push({
          id: content.id,
          platform: content.platform,
          title: content.title || 'Sem título',
          url: content.permalink || '',
          views: gained ? gained.get(content.id) ?? 0 : content.latestViews || 0,
          publishedAt: content.publishedAt?.toISOString() || '',
          thumbnailUrl: thumbnailPath(content),
          excluded: content.excludedAt !== null,
        });
      }
    }

    allContents.sort((a, b) => b.views - a.views);

    return allContents;
  }
}
