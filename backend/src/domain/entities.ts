import {
  AppRole,
  AuditLogId,
  ConnectionStatus,
  ContentId,
  MembershipId,
  MembershipStatus,
  MetricAvailability,
  ProfileId,
  RankingCategory,
  RankingEntryId,
  RankingVersionId,
  RankingVersionStatus,
  SocialAccountId,
  SocialPlatform,
  SocialTransport,
  SyncJobId,
  SyncJobStatus,
  SyncRunId,
} from './types';

export interface Profile {
  id: ProfileId;
  email: string;
  fullName: string;
  publicName: string;
  avatarUrl: string | null;
  role: AppRole;
  onboardingCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AmbassadorMembership {
  id: MembershipId;
  profileId: ProfileId;
  status: MembershipStatus;
  approvedAt: Date | null;
  approvedBy: ProfileId | null;
  suspendedAt: Date | null;
  suspensionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SocialAccount {
  id: SocialAccountId;
  profileId: ProfileId;
  platform: SocialPlatform;
  platformUserId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  status: ConnectionStatus;
  transport: SocialTransport;
  lastSyncedAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
  syncCoverageRatio: number | null;
  syncMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  disconnectedAt: Date | null;
}

export interface ContentItem {
  id: ContentId;
  socialAccountId: SocialAccountId;
  platform: SocialPlatform;
  platformContentId: string;
  title: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  publishedAt: Date | null;
  mediaType: string | null;
  eligible: boolean;
  excludedAt: Date | null;
  exclusionReason: string | null;
  excludedBy: ProfileId | null;
  removedOnPlatform: boolean;
  latestViews: number | null;
  latestViewsCollectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentMetricSnapshot {
  id: string;
  contentId: ContentId;
  collectedAt: Date;
  views: number | null;
  viewsAvailable: boolean;
  source: string;
  periodLabel: string | null;
  payload: Record<string, unknown> | null;
  syncRunId: SyncRunId | null;
}

export interface AccountMetricSnapshot {
  id: string;
  socialAccountId: SocialAccountId;
  collectedAt: Date;
  officialViews: number | null;
  availability: MetricAvailability;
  periodLabel: string | null;
  definitionLabel: string | null;
  source: string;
  payload: Record<string, unknown> | null;
  syncRunId: SyncRunId | null;
}

export interface SyncJob {
  id: SyncJobId;
  socialAccountId: SocialAccountId;
  jobType: string;
  status: SyncJobStatus;
  priority: number;
  scheduledAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  checkpoint: Record<string, unknown> | null;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SyncRun {
  id: SyncRunId;
  syncJobId: SyncJobId;
  socialAccountId: SocialAccountId;
  startedAt: Date;
  finishedAt: Date | null;
  status: SyncJobStatus;
  itemsFetched: number;
  itemsUpserted: number;
  coverageRatio: number | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
}

export interface RankingVersion {
  id: RankingVersionId;
  platform: SocialPlatform;
  category: RankingCategory;
  status: RankingVersionStatus;
  computedAt: Date | null;
  publishedAt: Date | null;
  participantCount: number;
  staleToleranceHours: number;
  notes: string | null;
  createdAt: Date;
}

export interface RankingEntry {
  id: RankingEntryId;
  rankingVersionId: RankingVersionId;
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

export interface AuditLog {
  id: AuditLogId;
  actorId: ProfileId | null;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}
