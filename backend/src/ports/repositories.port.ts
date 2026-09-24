import {
  AmbassadorMembership,
  AuditLog,
  ContentItem,
  ContentMetricSnapshot,
  AccountMetricSnapshot,
  Profile,
  RankingEntry,
  RankingVersion,
  SocialAccount,
  SyncJob,
  SyncRun,
} from '../domain/entities';
import {
  AppRole,
  ConnectionStatus,
  ContentId,
  MembershipId,
  MetricAvailability,
  ProfileId,
  RankingCategory,
  RankingVersionId,
  SocialAccountId,
  SocialPlatform,
  SocialTransport,
  SyncJobId,
  SyncJobStatus,
  SyncRunId,
} from '../domain/types';
import { SocialCredentials } from './social-metrics.port';

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export interface CreateProfileInput {
  id: ProfileId;
  email: string;
  fullName: string;
  publicName: string;
  avatarUrl?: string | null;
  role?: AppRole;
}

export interface UpdateProfileInput {
  fullName?: string;
  publicName?: string;
  avatarUrl?: string | null;
  onboardingCompleted?: boolean;
}

export interface ProfileRepository {
  findById(id: ProfileId): Promise<Profile | null>;
  findByEmail(email: string): Promise<Profile | null>;
  create(input: CreateProfileInput): Promise<Profile>;
  update(id: ProfileId, input: UpdateProfileInput): Promise<Profile>;
  softDelete(id: ProfileId): Promise<void>;
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

export interface MembershipRepository {
  findByProfileId(profileId: ProfileId): Promise<AmbassadorMembership | null>;
  findById(id: MembershipId): Promise<AmbassadorMembership | null>;
  findApproved(): Promise<AmbassadorMembership[]>;
  findAll(): Promise<AmbassadorMembership[]>;
  approve(
    profileId: ProfileId,
    approvedBy: ProfileId,
    approvedAt: Date,
  ): Promise<AmbassadorMembership>;
  suspend(
    profileId: ProfileId,
    reason: string,
    suspendedAt: Date,
  ): Promise<AmbassadorMembership>;
  reinstate(profileId: ProfileId): Promise<AmbassadorMembership>;
}

// ---------------------------------------------------------------------------
// Social account
// ---------------------------------------------------------------------------

export interface CreateSocialAccountInput {
  profileId: ProfileId;
  platform: SocialPlatform;
  platformUserId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  transport: SocialTransport;
}

export interface UpdateSocialAccountInput {
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  profileUrl?: string | null;
  status?: ConnectionStatus;
  lastSyncedAt?: Date | null;
  lastSuccessfulSyncAt?: Date | null;
  syncCoverageRatio?: number | null;
  syncMessage?: string | null;
  disconnectedAt?: Date | null;
}

export interface StoredSocialCredentials {
  socialAccountId: SocialAccountId;
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string | null;
  tokenExpiresAt: Date | null;
  refreshExpiresAt: Date | null;
  scopes: string[];
  encryptionKid: string;
}

export interface SocialAccountRepository {
  findById(id: SocialAccountId): Promise<SocialAccount | null>;
  findByProfileAndPlatform(
    profileId: ProfileId,
    platform: SocialPlatform,
  ): Promise<SocialAccount | null>;
  findByPlatformUserId(
    platform: SocialPlatform,
    platformUserId: string,
  ): Promise<SocialAccount | null>;
  findConnectedByPlatform(platform: SocialPlatform): Promise<SocialAccount[]>;
  create(input: CreateSocialAccountInput): Promise<SocialAccount>;
  update(id: SocialAccountId, input: UpdateSocialAccountInput): Promise<SocialAccount>;
  saveCredentials(
    socialAccountId: SocialAccountId,
    creds: StoredSocialCredentials,
  ): Promise<void>;
  getCredentials(socialAccountId: SocialAccountId): Promise<StoredSocialCredentials | null>;
  deleteCredentials(socialAccountId: SocialAccountId): Promise<void>;
  /** Decrypted credentials for adapter use — implemented in infrastructure layer. */
  getDecryptedCredentials(
    socialAccountId: SocialAccountId,
  ): Promise<SocialCredentials | null>;
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export interface UpsertContentInput {
  socialAccountId: SocialAccountId;
  platform: SocialPlatform;
  platformContentId: string;
  title: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  publishedAt: Date | null;
  mediaType: string | null;
  latestViews: number | null;
  latestViewsCollectedAt: Date | null;
}

export interface ContentRepository {
  findById(id: ContentId): Promise<ContentItem | null>;
  findByPlatformContentId(
    platform: SocialPlatform,
    platformContentId: string,
  ): Promise<ContentItem | null>;
  findEligibleByAccount(socialAccountId: SocialAccountId): Promise<ContentItem[]>;
  upsert(input: UpsertContentInput): Promise<ContentItem>;
  markRemoved(id: ContentId): Promise<void>;
  exclude(
    id: ContentId,
    reason: string,
    excludedBy: ProfileId,
    excludedAt: Date,
  ): Promise<ContentItem>;
  restore(id: ContentId): Promise<ContentItem>;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export interface InsertContentSnapshotInput {
  contentId: ContentId;
  collectedAt: Date;
  views: number | null;
  viewsAvailable: boolean;
  source: string;
  periodLabel?: string | null;
  payload?: Record<string, unknown> | null;
  syncRunId?: SyncRunId | null;
}

export interface InsertAccountSnapshotInput {
  socialAccountId: SocialAccountId;
  collectedAt: Date;
  officialViews: number | null;
  availability: MetricAvailability;
  periodLabel?: string | null;
  definitionLabel?: string | null;
  source: string;
  payload?: Record<string, unknown> | null;
  syncRunId?: SyncRunId | null;
}

export interface AmbassadorMetricAggregate {
  profileId: ProfileId;
  totalViews: number;
  bestVideoViews: number;
  bestContentId: ContentId | null;
}

export interface MetricsRepository {
  insertContentSnapshot(input: InsertContentSnapshotInput): Promise<ContentMetricSnapshot>;
  insertAccountSnapshot(input: InsertAccountSnapshotInput): Promise<AccountMetricSnapshot>;
  getLatestContentSnapshot(contentId: ContentId): Promise<ContentMetricSnapshot | null>;
  getLatestAccountSnapshot(
    socialAccountId: SocialAccountId,
  ): Promise<AccountMetricSnapshot | null>;
  aggregateEligibleMetricsByAccount(
    socialAccountId: SocialAccountId,
  ): Promise<AmbassadorMetricAggregate | null>;
}

// ---------------------------------------------------------------------------
// Sync jobs & runs
// ---------------------------------------------------------------------------

export interface EnqueueSyncJobInput {
  socialAccountId: SocialAccountId;
  jobType?: string;
  priority?: number;
  scheduledAt?: Date;
}

export interface UpdateSyncJobInput {
  status?: SyncJobStatus;
  lockedAt?: Date | null;
  lockedBy?: string | null;
  checkpoint?: Record<string, unknown> | null;
  attempts?: number;
  nextAttemptAt?: Date | null;
  lastError?: string | null;
}

export interface CreateSyncRunInput {
  syncJobId: SyncJobId;
  socialAccountId: SocialAccountId;
  startedAt: Date;
}

export interface FinishSyncRunInput {
  status: SyncJobStatus;
  finishedAt: Date;
  itemsFetched: number;
  itemsUpserted: number;
  coverageRatio: number | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface SyncJobRepository {
  findById(id: SyncJobId): Promise<SyncJob | null>;
  findActiveByAccount(socialAccountId: SocialAccountId): Promise<SyncJob | null>;
  enqueue(input: EnqueueSyncJobInput): Promise<SyncJob>;
  claimNext(workerId: string, now: Date): Promise<SyncJob | null>;
  update(id: SyncJobId, input: UpdateSyncJobInput): Promise<SyncJob>;
  createRun(input: CreateSyncRunInput): Promise<SyncRun>;
  finishRun(runId: SyncRunId, input: FinishSyncRunInput): Promise<SyncRun>;
  findLatestRunByAccount(socialAccountId: SocialAccountId): Promise<SyncRun | null>;
  findRecent(limit: number): Promise<SyncJob[]>;
}

// ---------------------------------------------------------------------------
// Rankings
// ---------------------------------------------------------------------------

export interface PublishRankingEntryInput {
  position: number;
  profileId: ProfileId;
  publicName: string;
  avatarUrl: string | null;
  totalViews: number;
  bestVideoViews: number;
  bestContentId: ContentId | null;
  score: number;
  lastSyncedAt: Date | null;
  isStale: boolean;
}

export interface PublishRankingInput {
  platform: SocialPlatform;
  category: RankingCategory;
  staleToleranceHours: number;
  notes?: string | null;
  computedAt: Date;
  entries: PublishRankingEntryInput[];
}

export interface RankingRepository {
  findPublished(
    platform: SocialPlatform,
    category: RankingCategory,
  ): Promise<{ version: RankingVersion; entries: RankingEntry[] } | null>;
  findVersionById(id: RankingVersionId): Promise<RankingVersion | null>;
  /**
   * Atomically supersedes the current published version (if any) and publishes a new one.
   * Must run inside a single database transaction.
   */
  publishAtomic(input: PublishRankingInput): Promise<{
    version: RankingVersion;
    entries: RankingEntry[];
  }>;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AppendAuditLogInput {
  actorId: ProfileId | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
}

export interface AuditRepository {
  append(input: AppendAuditLogInput): Promise<AuditLog>;
  findRecent(limit: number): Promise<AuditLog[]>;
  findByEntity(entityType: string, entityId: string): Promise<AuditLog[]>;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface SettingsRepository {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, updatedBy?: ProfileId): Promise<void>;
  getNumber(key: string, defaultValue: number): Promise<number>;
}

// ---------------------------------------------------------------------------
// OAuth state
// ---------------------------------------------------------------------------

export interface CreateOAuthStateInput {
  profileId: ProfileId;
  platform: SocialPlatform;
  state: string;
  codeVerifier?: string | null;
  redirectPath?: string | null;
  expiresAt: Date;
}

export interface OAuthStateRecord {
  id: string;
  profileId: ProfileId;
  platform: SocialPlatform;
  state: string;
  codeVerifier: string | null;
  redirectPath: string | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface OAuthStateRepository {
  create(input: CreateOAuthStateInput): Promise<OAuthStateRecord>;
  consume(state: string, now: Date): Promise<OAuthStateRecord | null>;
  deleteExpired(before: Date): Promise<number>;
}
