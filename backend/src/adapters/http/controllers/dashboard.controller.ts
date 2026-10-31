import { BadRequestException, Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { GetDashboardUseCase } from '../../../application/dashboard/get-dashboard.use-case';
import { AccountReviewStatus, SocialPlatform } from '../../../domain/types';
import { MetricsRepository, SocialAccountRepository } from '../../../ports/repositories.port';
import { INJECTION_TOKENS } from '../../../infrastructure/tokens/injection-tokens';

const GROWTH_DAYS = 30;

@Controller('api')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(
    private readonly getDashboardUseCase: GetDashboardUseCase,
    @Inject(INJECTION_TOKENS.SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccountRepo: SocialAccountRepository,
    @Inject(INJECTION_TOKENS.METRICS_REPOSITORY)
    private readonly metricsRepo: MetricsRepository,
  ) {}
  
  @Get('dashboard')
  async getDashboard(@Req() req: any) {
    const result = await this.getDashboardUseCase.execute(req.user.id);
    
    return {
      totalViews: result.totalViews,
      byPlatform: result.byPlatform,
      bestVideo: result.bestVideo,
      lastSyncAt: result.lastSyncAt?.toISOString() ?? null,
      accounts: result.accounts.map((account) => ({
        ...account,
        lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
      })),
      rankingCriteria: result.rankingCriteria,
    };
  }

  /**
   * Views somadas por dia nos últimos 30 dias, a partir da primeira medição, juntando todas as
   * contas aprovadas. `platform` é opcional e limita a uma rede.
   */
  @Get('dashboard/growth')
  async getGrowth(@Req() req: any, @Query('platform') platformParam?: string) {
    if (platformParam && !Object.values(SocialPlatform).includes(platformParam as SocialPlatform)) {
      throw new BadRequestException('Plataforma inválida.');
    }
    const platform = (platformParam as SocialPlatform | undefined) ?? null;
    const accounts = (await this.socialAccountRepo.findActiveByProfile(req.user.id)).filter(
      (account) =>
        account.reviewStatus === AccountReviewStatus.Approved &&
        (!platform || account.platform === platform),
    );
    if (accounts.length === 0) {
      return { platform, points: [], current: null, lastWeek: null };
    }
    const daily = await this.metricsRepo.dailyViewsByAccounts(
      accounts.map((account) => account.id),
      GROWTH_DAYS,
    );
    const first = daily.findIndex((item) => item.measured);
    const points = first < 0 ? [] : daily.slice(first).map(({ day, views }) => ({ day, views }));
    const current = points.length > 0 ? points[points.length - 1].views : null;
    const weekAgo = points.length > 7 ? points[points.length - 8].views : null;
    return {
      platform,
      points,
      current,
      lastWeek: current !== null && weekAgo !== null ? Math.max(0, current - weekAgo) : null,
    };
  }
}
