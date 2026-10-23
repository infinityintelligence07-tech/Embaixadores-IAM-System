import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AccountReviewService } from '../../../application/social/account-review.service';
import { CampaignsService } from '../../../application/rankings/campaigns.service';
import { ComputeAndPublishRankingUseCase } from '../../../application/rankings/compute-and-publish.use-case';
import { INJECTION_TOKENS } from '../../../infrastructure/tokens/injection-tokens';
import { ClockPort } from '../../../ports/clock.port';
import { AuditRepository } from '../../../ports/repositories.port';
import { ProfileId } from '../../../domain/types';
import { CreateCampaignDto, RankingModeDto, ReviewAccountDto } from '../dto/admin.dto';
import { AdminGuard } from '../guards/admin.guard';
import { AuthGuard } from '../guards/auth.guard';
import { uuidPipe } from '../pipes/uuid.pipe';

@Controller('api/admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminCompetitionController {
  constructor(
    @Inject(INJECTION_TOKENS.CLOCK)
    private readonly clock: ClockPort,
    @Inject(INJECTION_TOKENS.AUDIT_REPOSITORY)
    private readonly auditRepo: AuditRepository,
    private readonly accountReview: AccountReviewService,
    private readonly campaigns: CampaignsService,
    private readonly ranking: ComputeAndPublishRankingUseCase,
  ) {}

  @Get('account-reviews')
  listAccountReviews() {
    return this.accountReview.listOpen();
  }

  @Post('accounts/:id/review')
  async reviewAccount(
    @Req() req: { user: { id: string } },
    @Param('id', uuidPipe('Conta inválida.')) id: string,
    @Body() body: ReviewAccountDto,
  ) {
    const decision = this.accountReview.parseDecision(body.decision);
    const account = await this.accountReview.review(
      id,
      decision,
      body.note,
      req.user.id as ProfileId,
    );
    return { id: account.id, reviewStatus: account.reviewStatus, reviewNote: account.reviewNote };
  }

  @Get('campaigns')
  async listCampaigns() {
    const now = this.clock.now();
    await this.campaigns.ensureCurrentMonth(now);
    const [items, mode] = await Promise.all([this.campaigns.list(), this.campaigns.getMode()]);
    return { mode, items: items.map((item) => this.campaigns.toView(item, now)) };
  }

  @Post('campaigns')
  async createCampaign(@Req() req: { user: { id: string } }, @Body() body: CreateCampaignDto) {
    const campaign = await this.campaigns.create(body, req.user.id as ProfileId);
    await this.auditRepo.append({
      actorId: req.user.id as ProfileId,
      action: 'create_campaign',
      entityType: 'campaign',
      entityId: campaign.id,
      metadata: { name: campaign.name },
    });
    if (campaign.startsAt <= this.clock.now()) {
      await this.ranking.publishBoards(campaign);
    }
    return this.campaigns.toView(campaign, this.clock.now());
  }

  @Delete('campaigns/:id')
  async deleteCampaign(
    @Req() req: { user: { id: string } },
    @Param('id', uuidPipe('Campanha inválida.')) id: string,
  ) {
    const removed = await this.campaigns.remove(id);
    await this.auditRepo.append({
      actorId: req.user.id as ProfileId,
      action: 'delete_campaign',
      entityType: 'campaign',
      entityId: removed.id,
      metadata: { name: removed.name },
    });
    return { ok: true };
  }

  @Patch('ranking-mode')
  async setRankingMode(@Req() req: { user: { id: string } }, @Body() body: RankingModeDto) {
    const mode = await this.campaigns.setMode(body.mode, req.user.id as ProfileId);
    await this.auditRepo.append({
      actorId: req.user.id as ProfileId,
      action: 'update_ranking_mode',
      entityType: 'settings',
      metadata: { mode },
    });
    if (mode === 'monthly') {
      await this.campaigns.ensureCurrentMonth(this.clock.now());
      await this.ranking.publishAll();
    }
    return { mode };
  }
}
