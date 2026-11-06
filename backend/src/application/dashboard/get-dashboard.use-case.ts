import { Injectable, Inject } from '@nestjs/common';
import { AccountReviewStatus, ProfileId, SocialPlatform } from '../../domain/types';
import { ContentItem, SocialAccount } from '../../domain/entities';
import {
  SocialAccountRepository,
  ContentRepository,
  MetricsRepository,
} from '../../ports/repositories.port';
import { INJECTION_TOKENS } from '../../infrastructure/tokens/injection-tokens';
import { countsTowardRanking } from '../../domain/ranked-media';

export interface DashboardAccount {
  id: string;
  platform: SocialPlatform;
  username: string | null;
  views: number;
  reviewStatus: AccountReviewStatus;
  lastSyncAt: Date | null;
}

export interface DashboardResult {
  /** Desde o início, só contas aprovadas. */
  totalViews: number;
  byPlatform: Record<SocialPlatform, number>;
  bestVideo: {
    id: string;
    title: string | null;
    views: number;
    permalink: string | null;
    platform: SocialPlatform;
    username: string | null;
  } | null;
  /** Coleta mais recente entre as contas. */
  lastSyncAt: Date | null;
  accounts: DashboardAccount[];
  rankingCriteria: string;
}

@Injectable()
export class GetDashboardUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccountRepo: SocialAccountRepository,
    @Inject(INJECTION_TOKENS.CONTENT_REPOSITORY)
    private readonly contentRepo: ContentRepository,
    @Inject(INJECTION_TOKENS.METRICS_REPOSITORY)
    private readonly metricsRepo: MetricsRepository,
  ) {}
  
  async execute(profileId: ProfileId): Promise<DashboardResult> {
    const accounts = await this.socialAccountRepo.findActiveByProfile(profileId);
    const views = await this.metricsRepo.totalViewsByAccounts(accounts.map((item) => item.id));

    const byPlatform: Record<SocialPlatform, number> = {
      [SocialPlatform.Instagram]: 0,
      [SocialPlatform.TikTok]: 0,
    };
    let best: { content: ContentItem; account: SocialAccount } | null = null;

    for (const account of accounts) {
      if (account.reviewStatus !== AccountReviewStatus.Approved) continue;
      byPlatform[account.platform] += views.get(account.id) ?? 0;
      const contents = (await this.contentRepo.findEligibleByAccount(account.id)).filter(
        (content) => countsTowardRanking(account.platform, content),
      );
      for (const content of contents) {
        if (!best || (content.latestViews ?? 0) > (best.content.latestViews ?? 0)) {
          best = { content, account };
        }
      }
    }

    const lastSyncAt = accounts.reduce<Date | null>(
      (latest, account) =>
        account.lastSyncedAt && (!latest || account.lastSyncedAt > latest)
          ? account.lastSyncedAt
          : latest,
      null,
    );

    return {
      totalViews: byPlatform[SocialPlatform.Instagram] + byPlatform[SocialPlatform.TikTok],
      byPlatform,
      bestVideo: best
        ? {
            id: best.content.id,
            title: best.content.title,
            views: best.content.latestViews ?? 0,
            permalink: best.content.permalink,
            platform: best.account.platform,
            username: best.account.username,
          }
        : null,
      lastSyncAt,
      accounts: accounts.map((account) => ({
        id: account.id,
        platform: account.platform,
        username: account.username,
        views: views.get(account.id) ?? 0,
        reviewStatus: account.reviewStatus,
        lastSyncAt: account.lastSyncedAt,
      })),
      rankingCriteria:
        'O ranking soma as views dos Reels e vídeos de todas as suas contas aprovadas, no Instagram e no TikTok, desde que a legenda cite #MarcosFiel, @marcosfiel, Marcos Fiel ou #AcordeSuaMente. Fotos e carrosséis não contam. Na campanha, só contam os vídeos postados dentro do período. A equipe pode retirar vídeos que fujam do tema.',
    };
  }
}
