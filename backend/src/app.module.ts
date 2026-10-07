import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './adapters/http/guards/app-throttler.guard';

// Infrastructure
import { INJECTION_TOKENS } from './infrastructure/tokens/injection-tokens';
import { SyncSchedulerService } from './infrastructure/scheduler/sync-scheduler.service';

// Adapters - Auth & Crypto
import { SupabaseAuthAdapter } from './adapters/auth/supabase-auth.adapter';
import { AesTokenEncryptionAdapter } from './adapters/crypto/aes-token-encryption.adapter';
import { SystemClockAdapter } from './adapters/clock/system-clock.adapter';

// Adapters - Social
import { SocialProviderFactory } from './adapters/social/social-provider.factory';

// Adapters - Persistence
import { PgProfileRepository } from './adapters/persistence/pg/profile.repository';
import { PgMembershipRepository } from './adapters/persistence/pg/membership.repository';
import { PgSocialAccountRepository } from './adapters/persistence/pg/social-account.repository';
import { PgContentRepository } from './adapters/persistence/pg/content.repository';
import { PgMetricsRepository } from './adapters/persistence/pg/metrics.repository';
import { PgSyncJobRepository } from './adapters/persistence/pg/sync-job.repository';
import { PgRankingRepository } from './adapters/persistence/pg/ranking.repository';
import { PgAuditRepository } from './adapters/persistence/pg/audit.repository';
import { PgSettingsRepository } from './adapters/persistence/pg/settings.repository';
import { PgOAuthStateRepository } from './adapters/persistence/pg/oauth-state.repository';

// Application - Use Cases
import { GetMeUseCase } from './application/identity/get-me.use-case';
import { StaffAccessService } from './application/identity/staff-access.service';
import { ApplicationsService } from './application/applications/applications.service';
import { UpdateMeUseCase } from './application/identity/update-me.use-case';
import { GetDashboardUseCase } from './application/dashboard/get-dashboard.use-case';
import { StartOAuthUseCase } from './application/social/start-oauth.use-case';
import { OAuthCallbackUseCase } from './application/social/oauth-callback.use-case';
import { SyncAccountUseCase } from './application/sync/sync-account.use-case';
import { ComputeAndPublishRankingUseCase } from './application/rankings/compute-and-publish.use-case';

// HTTP - Controllers & Guards
import { HealthController } from './adapters/http/controllers/health.controller';
import { IdentityController } from './adapters/http/controllers/identity.controller';
import { DashboardController } from './adapters/http/controllers/dashboard.controller';
import { SocialController } from './adapters/http/controllers/social.controller';
import { RankingsController } from './adapters/http/controllers/rankings.controller';
import { ContentsController } from './adapters/http/controllers/contents.controller';
import { AdminController } from './adapters/http/controllers/admin.controller';
import {
  AdminApplicationsController,
  ApplicationsController,
} from './adapters/http/controllers/applications.controller';
import { AuthGuard } from './adapters/http/guards/auth.guard';
import { AdminGuard } from './adapters/http/guards/admin.guard';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 300,
      },
    ]),
  ],
  providers: [
    // Limite de requisições por IP (configurado no ThrottlerModule)
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },

    // Ports
    {
      provide: INJECTION_TOKENS.CLOCK,
      useClass: SystemClockAdapter,
    },
    {
      provide: INJECTION_TOKENS.TOKEN_ENCRYPTION,
      useFactory: () => {
        const adapter = new AesTokenEncryptionAdapter();
        return adapter;
      },
    },
    {
      provide: INJECTION_TOKENS.AUTH,
      useClass: SupabaseAuthAdapter,
    },
    
    // Repositories
    {
      provide: INJECTION_TOKENS.PROFILE_REPOSITORY,
      useClass: PgProfileRepository,
    },
    {
      provide: INJECTION_TOKENS.MEMBERSHIP_REPOSITORY,
      useClass: PgMembershipRepository,
    },
    {
      provide: INJECTION_TOKENS.SOCIAL_ACCOUNT_REPOSITORY,
      useFactory: (encryption: AesTokenEncryptionAdapter) => {
        return new PgSocialAccountRepository(encryption);
      },
      inject: [INJECTION_TOKENS.TOKEN_ENCRYPTION],
    },
    {
      provide: INJECTION_TOKENS.CONTENT_REPOSITORY,
      useClass: PgContentRepository,
    },
    {
      provide: INJECTION_TOKENS.METRICS_REPOSITORY,
      useClass: PgMetricsRepository,
    },
    {
      provide: INJECTION_TOKENS.SYNC_JOB_REPOSITORY,
      useClass: PgSyncJobRepository,
    },
    {
      provide: INJECTION_TOKENS.RANKING_REPOSITORY,
      useClass: PgRankingRepository,
    },
    {
      provide: INJECTION_TOKENS.AUDIT_REPOSITORY,
      useClass: PgAuditRepository,
    },
    {
      provide: INJECTION_TOKENS.SETTINGS_REPOSITORY,
      useClass: PgSettingsRepository,
    },
    {
      provide: INJECTION_TOKENS.OAUTH_STATE_REPOSITORY,
      useClass: PgOAuthStateRepository,
    },
    
    // Social providers
    {
      provide: INJECTION_TOKENS.SOCIAL_PROVIDER_FACTORY,
      useClass: SocialProviderFactory,
    },
    
    // Use cases
    GetMeUseCase,
    StaffAccessService,
    ApplicationsService,
    UpdateMeUseCase,
    GetDashboardUseCase,
    StartOAuthUseCase,
    OAuthCallbackUseCase,
    SyncAccountUseCase,
    ComputeAndPublishRankingUseCase,
    
    // Infrastructure
    SyncSchedulerService,

    // Guards (DI)
    AuthGuard,
    AdminGuard,
  ],
  controllers: [
    HealthController,
    IdentityController,
    DashboardController,
    SocialController,
    RankingsController,
    ContentsController,
    AdminController,
    ApplicationsController,
    AdminApplicationsController,
  ],
})
export class AppModule {}
