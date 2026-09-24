import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { GetDashboardUseCase } from '../../../application/dashboard/get-dashboard.use-case';

@Controller('api')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly getDashboardUseCase: GetDashboardUseCase) {}
  
  @Get('dashboard')
  async getDashboard(@Req() req: any) {
    const result = await this.getDashboardUseCase.execute(req.user.id);
    
    return {
      slices: result.slices.map(slice => ({
        platform: slice.platform,
        positionTotal: slice.positionTotal,
        positionBest: slice.positionBest,
        totalParticipants: slice.totalParticipants,
        ineligibilityReason: slice.ineligibilityReason,
        monitoredViewsTotal: slice.monitoredViewsTotal,
        bestVideo: slice.bestVideo,
        officialAccountViews: slice.officialAccountViews,
        officialAccountViewsLabel: slice.officialAccountViewsLabel,
        contentCount: slice.contentCount,
        lastSyncAt: slice.lastSyncAt?.toISOString() || null,
        connectionStatus: slice.connectionStatus,
        syncCoverageRatio: slice.syncCoverageRatio,
      })),
      rankingCriteria: result.rankingCriteria,
    };
  }
}
