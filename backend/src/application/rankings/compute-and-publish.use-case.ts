import { Injectable, Inject, Logger } from '@nestjs/common';
import { RankingCategory, ProfileId, AppRole, SocialPlatform } from '../../domain/types';
import { AmbassadorMembership, Profile, SocialAccount } from '../../domain/entities';
import {
  AmbassadorMetricAggregate,
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
import {
  AccountEligibilityInput,
  ProfileEligibilityResult,
  isProfileEligibleForRanking,
} from '../../domain/eligibility';
import {
  compareRankingCandidates,
  assignSequentialPositions,
  combineAccountMetrics,
  RankingCandidate,
} from '../../domain/ranking-rules';
import { networkName } from '../../domain/social-handle';
import { Campaign, CampaignsService } from './campaigns.service';

const CATEGORIES = [RankingCategory.TotalViews, RankingCategory.BestVideo];
/** Null é o quadro geral (todas as redes); os outros somam só as contas daquela rede. */
const BOARDS: (SocialPlatform | null)[] = [null, SocialPlatform.Instagram, SocialPlatform.TikTok];

export interface CountedAccount {
  account: SocialAccount;
  isStale: boolean;
}

export interface PersonEligibility extends ProfileEligibilityResult {
  /** Contas que somam no ranking. */
  counted: CountedAccount[];
}

/** Pessoa elegível com as métricas de cada conta que soma, no período pedido. */
interface RankedPerson {
  profile: Profile;
  membership: AmbassadorMembership;
  accounts: (CountedAccount & { metrics: AmbassadorMetricAggregate })[];
}

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
    private readonly campaigns: CampaignsService,
  ) {}

  /** Ranking geral e de cada campanha ou mês que ainda recebe views. */
  async publishAll(): Promise<void> {
    const now = this.clock.now();
    let firstError: unknown = null;
    // O ranking geral sai primeiro e não depende das campanhas.
    try {
      await this.publishBoards(null);
    } catch (error) {
      firstError = error;
    }
    let open: Campaign[] = [];
    try {
      await this.campaigns.ensureCurrentMonth(now);
      open = await this.campaigns.toCompute(now);
    } catch (error) {
      this.logger.error(`Falha ao preparar rankings por período: ${error}`);
    }
    for (const campaign of open) {
      try {
        await this.publishBoards(campaign);
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError) throw firstError;
  }

  /**
   * Publica os quadros de um período: geral e um por rede, em cada categoria. As métricas são
   * lidas uma vez; um quadro com erro não impede os outros, e o primeiro erro sobe no fim.
   */
  async publishBoards(campaign: Campaign | null): Promise<void> {
    const now = this.clock.now();
    const staleToleranceHours = await this.settingsRepo.getNumber('stale_tolerance_hours', 24);
    const people = await this.collectPeople(campaign, staleToleranceHours, now);
    this.logger.log(
      `${people.length} pessoa(s) elegível(is)${campaign ? ` em ${campaign.name}` : ''}`,
    );

    let firstError: unknown = null;
    for (const platform of BOARDS) {
      for (const category of CATEGORIES) {
        try {
          await this.publishBoard(people, platform, category, campaign, staleToleranceHours, now);
        } catch (error) {
          this.logger.error(
            `Falha ao publicar ${platform ?? 'geral'}/${category}${campaign ? ` (${campaign.name})` : ''}: ${error}`,
          );
          firstError ??= error;
        }
      }
    }
    if (firstError) throw firstError;
  }

  /**
   * Mesma regra do cálculo, para explicar à pessoa por que ela está fora do ranking.
   * Com `platform`, olha só as contas daquela rede.
   */
  async eligibilityFor(
    profileId: ProfileId,
    staleToleranceHours?: number,
    platform: SocialPlatform | null = null,
  ): Promise<PersonEligibility> {
    const [profile, membership, accounts] = await Promise.all([
      this.profileRepo.findById(profileId),
      this.membershipRepo.findByProfileId(profileId),
      this.socialAccountRepo.findActiveByProfile(profileId),
    ]);
    const tolerance =
      staleToleranceHours ?? (await this.settingsRepo.getNumber('stale_tolerance_hours', 24));
    return this.evaluate(
      profile,
      membership,
      platform ? accounts.filter((account) => account.platform === platform) : accounts,
      tolerance,
      this.clock.now(),
      platform,
    );
  }

  private async collectPeople(
    campaign: Campaign | null,
    staleToleranceHours: number,
    now: Date,
  ): Promise<RankedPerson[]> {
    const [memberships, accounts] = await Promise.all([
      this.membershipRepo.findApproved(),
      this.socialAccountRepo.findAllActive(),
    ]);
    const accountsByProfile = new Map<string, SocialAccount[]>();
    for (const account of accounts) {
      const list = accountsByProfile.get(account.profileId) ?? [];
      list.push(account);
      accountsByProfile.set(account.profileId, list);
    }

    const window = campaign ? { from: campaign.startsAt, to: campaign.endsAt } : null;
    const people: RankedPerson[] = [];

    for (const membership of memberships) {
      const mine = accountsByProfile.get(membership.profileId);
      if (!mine?.length) continue;
      const profile = await this.profileRepo.findById(membership.profileId);
      if (!profile || profile.deletedAt) continue;

      const eligibility = await this.evaluate(profile, membership, mine, staleToleranceHours, now);
      if (!eligibility.eligible) {
        this.logger.debug(`Profile ${membership.profileId} ineligible: ${eligibility.reason}`);
        continue;
      }

      const counted: RankedPerson['accounts'] = [];
      for (const item of eligibility.counted) {
        const metrics = await this.metricsRepo.aggregateEligibleMetricsByAccount(
          item.account.id,
          window,
        );
        if (metrics) counted.push({ ...item, metrics });
      }
      if (counted.length > 0) people.push({ profile, membership, accounts: counted });
    }
    return people;
  }

  private async publishBoard(
    people: RankedPerson[],
    platform: SocialPlatform | null,
    category: RankingCategory,
    campaign: Campaign | null,
    staleToleranceHours: number,
    now: Date,
  ): Promise<void> {
    const candidates: RankingCandidate[] = [];
    for (const person of people) {
      // No quadro de uma rede, a pessoa entra só com conta aprovada naquela rede.
      const accounts = platform
        ? person.accounts.filter((item) => item.account.platform === platform)
        : person.accounts;
      if (accounts.length === 0) continue;
      const metrics = combineAccountMetrics(accounts.map((item) => item.metrics));

      // A data mais antiga entre as contas que somam: o dado da pessoa vale até ali.
      const syncedAt = accounts
        .map((item) => item.account.lastSyncedAt)
        .filter((value): value is Date => value !== null)
        .sort((a, b) => a.getTime() - b.getTime());

      candidates.push({
        profileId: person.profile.id,
        publicName: person.profile.publicName,
        avatarUrl: person.profile.avatarUrl,
        totalViews: metrics.totalViews,
        bestVideoViews: metrics.bestVideoViews,
        bestContentId: metrics.bestContentId,
        approvedAt: person.membership.approvedAt ?? person.membership.createdAt,
        lastSyncedAt: syncedAt[0] ?? null,
        isStale: accounts.some((item) => item.isStale),
      });
    }

    const sorted = [...candidates].sort((a, b) => compareRankingCandidates(a, b, category));
    const entries: PublishRankingEntryInput[] = assignSequentialPositions(sorted).map(
      (candidate) => ({
        position: candidate.position,
        profileId: candidate.profileId as ProfileId,
        publicName: candidate.publicName,
        avatarUrl: candidate.avatarUrl,
        totalViews: candidate.totalViews,
        bestVideoViews: candidate.bestVideoViews,
        bestContentId: candidate.bestContentId as PublishRankingEntryInput['bestContentId'],
        score:
          category === RankingCategory.TotalViews ? candidate.totalViews : candidate.bestVideoViews,
        lastSyncedAt: candidate.lastSyncedAt,
        isStale: candidate.isStale,
      }),
    );

    const result = await this.rankingRepo.publishAtomic({
      platform,
      category,
      campaignId: campaign?.id ?? null,
      staleToleranceHours,
      computedAt: now,
      entries,
    });

    this.logger.log(
      `Published ${platform ?? 'geral'}/${category} ranking ${result.version.id} with ${entries.length} entries`,
    );
  }

  private async evaluate(
    profile: Profile | null,
    membership: AmbassadorMembership | null,
    accounts: SocialAccount[],
    staleToleranceHours: number,
    now: Date,
    platform: SocialPlatform | null = null,
  ): Promise<PersonEligibility> {
    const inputs: AccountEligibilityInput[] = [];
    for (const account of accounts) {
      inputs.push({
        connectionStatus: account.status,
        reviewStatus: account.reviewStatus,
        reviewNote: account.reviewNote,
        lastSyncedAt: account.lastSyncedAt,
        syncCoverageRatio: account.syncCoverageRatio,
        firstSyncIncomplete: await this.firstSyncIncomplete(account),
      });
    }
    // A equipe acompanha a competição, mas não disputa posição com os embaixadores.
    const result = isProfileEligibleForRanking({
      isAdmin: profile?.role === AppRole.Admin,
      membershipStatus: membership?.status ?? null,
      accounts: inputs,
      staleToleranceHours,
      now,
      networkName: platform ? networkName(platform) : undefined,
    });
    return {
      ...result,
      counted: result.countedAccounts.map((index) => ({
        account: accounts[index],
        isStale: result.staleAccounts.includes(index),
      })),
    };
  }

  private async firstSyncIncomplete(account: SocialAccount): Promise<boolean> {
    if (account.lastSuccessfulSyncAt) return false;
    return !(await this.metricsRepo.getLatestAccountSnapshot(account.id));
  }
}
