import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { uuidPipe } from '../pipes/uuid.pipe';
import { AccountReviewStatus, AppRole, RankingCategory } from '../../../domain/types';
import {
  ContentRepository,
  MembershipRepository,
  MetricsRepository,
  ProfileRepository,
  RankingRepository,
  SocialAccountRepository,
} from '../../../ports/repositories.port';
import { INJECTION_TOKENS } from '../../../infrastructure/tokens/injection-tokens';
import { countsTowardRanking } from '../../../domain/ranked-media';
import { thumbnailPath } from './media.controller';

const TOP_VIDEOS = 6;

/**
 * Perfil público de quem disputa o ranking, para os outros embaixadores se inspirarem.
 * Mostra só o que já é público nas redes: contas aprovadas e os vídeos que contam.
 */
@Controller('api/ambassadors')
@UseGuards(AuthGuard)
export class AmbassadorsController {
  constructor(
    @Inject(INJECTION_TOKENS.PROFILE_REPOSITORY)
    private readonly profileRepo: ProfileRepository,
    @Inject(INJECTION_TOKENS.MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: MembershipRepository,
    @Inject(INJECTION_TOKENS.SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccountRepo: SocialAccountRepository,
    @Inject(INJECTION_TOKENS.CONTENT_REPOSITORY)
    private readonly contentRepo: ContentRepository,
    @Inject(INJECTION_TOKENS.METRICS_REPOSITORY)
    private readonly metricsRepo: MetricsRepository,
    @Inject(INJECTION_TOKENS.RANKING_REPOSITORY)
    private readonly rankingRepo: RankingRepository,
  ) {}

  @Get(':id')
  async profile(@Param('id', uuidPipe('Embaixador inválido.')) id: string) {
    const profile = await this.profileRepo.findById(id as never);
    const membership = profile ? await this.membershipRepo.findByProfileId(profile.id) : null;
    if (!profile || profile.deletedAt || profile.role === AppRole.Admin || membership?.status === 'suspended') {
      throw new NotFoundException('Não encontramos esse embaixador.');
    }

    const accounts = (await this.socialAccountRepo.findActiveByProfile(profile.id)).filter(
      (account) => account.reviewStatus === AccountReviewStatus.Approved,
    );
    const views = await this.metricsRepo.totalViewsByAccounts(accounts.map((account) => account.id));

    const videos = [];
    for (const account of accounts) {
      const contents = await this.contentRepo.findEligibleByAccount(account.id);
      for (const content of contents) {
        if (content.excludedAt || !countsTowardRanking(account.platform, content)) continue;
        videos.push({
          id: content.id,
          platform: account.platform,
          username: account.username,
          title: content.title,
          views: content.latestViews ?? 0,
          url: content.permalink,
          thumbnailUrl: thumbnailPath(content),
          publishedAt: content.publishedAt?.toISOString() ?? null,
        });
      }
    }
    videos.sort((a, b) => b.views - a.views);

    const general = await this.rankingRepo.findPublished(null, RankingCategory.TotalViews, null);
    const entry = general?.entries.find((item) => item.profileId === profile.id) ?? null;

    return {
      id: profile.id,
      publicName: profile.publicName,
      avatarUrl: profile.avatarUrl,
      position: entry?.position ?? null,
      participants: general?.entries.length ?? 0,
      totalViews: accounts.reduce((sum, account) => sum + (views.get(account.id) ?? 0), 0),
      accounts: accounts.map((account) => ({
        id: account.id,
        platform: account.platform,
        username: account.username,
        profileUrl: account.profileUrl,
        views: views.get(account.id) ?? 0,
      })),
      videos: videos.slice(0, TOP_VIDEOS),
    };
  }
}
