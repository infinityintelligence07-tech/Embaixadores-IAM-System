/** Branded identifier types — opaque strings at runtime. */

export type ProfileId = string & { readonly __brand: 'ProfileId' };
export type MembershipId = string & { readonly __brand: 'MembershipId' };
export type SocialAccountId = string & { readonly __brand: 'SocialAccountId' };
export type ContentId = string & { readonly __brand: 'ContentId' };
export type SyncJobId = string & { readonly __brand: 'SyncJobId' };
export type SyncRunId = string & { readonly __brand: 'SyncRunId' };
export type RankingVersionId = string & { readonly __brand: 'RankingVersionId' };
export type RankingEntryId = string & { readonly __brand: 'RankingEntryId' };
export type AuditLogId = string & { readonly __brand: 'AuditLogId' };
export type OAuthStateId = string & { readonly __brand: 'OAuthStateId' };

export const asProfileId = (value: string): ProfileId => value as ProfileId;
export const asMembershipId = (value: string): MembershipId => value as MembershipId;
export const asSocialAccountId = (value: string): SocialAccountId =>
  value as SocialAccountId;
export const asContentId = (value: string): ContentId => value as ContentId;
export const asSyncJobId = (value: string): SyncJobId => value as SyncJobId;
export const asSyncRunId = (value: string): SyncRunId => value as SyncRunId;
export const asRankingVersionId = (value: string): RankingVersionId =>
  value as RankingVersionId;
export const asRankingEntryId = (value: string): RankingEntryId =>
  value as RankingEntryId;
export const asAuditLogId = (value: string): AuditLogId => value as AuditLogId;
export const asOAuthStateId = (value: string): OAuthStateId =>
  value as OAuthStateId;

export enum AppRole {
  Ambassador = 'ambassador',
  Admin = 'admin',
}

export enum MembershipStatus {
  Pending = 'pending',
  Approved = 'approved',
  Suspended = 'suspended',
}

export enum SocialPlatform {
  Instagram = 'instagram',
  TikTok = 'tiktok',
}

export enum ConnectionStatus {
  Connected = 'connected',
  Syncing = 'syncing',
  AuthorizationExpired = 'authorization_expired',
  InsufficientPermission = 'insufficient_permission',
  IncompatibleAccount = 'incompatible_account',
  IntegrationUnavailable = 'integration_unavailable',
  Disconnected = 'disconnected',
}

export enum SyncJobStatus {
  Pending = 'pending',
  Running = 'running',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export enum RankingCategory {
  TotalViews = 'total_views',
  BestVideo = 'best_video',
}

export enum RankingVersionStatus {
  Computing = 'computing',
  Published = 'published',
  Superseded = 'superseded',
}

export enum MetricAvailability {
  Available = 'available',
  Unavailable = 'unavailable',
  Partial = 'partial',
}

export enum SocialTransport {
  OfficialApi = 'official_api',
  Mcp = 'mcp',
  Demo = 'demo',
}
