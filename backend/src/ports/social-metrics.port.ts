export interface AuthorizedProfile {
  platformUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string | null;
}

export interface SocialContentItem {
  platformContentId: string;
  title: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  publishedAt: Date | null;
  mediaType: string | null;
  views: number | null;
  viewsAvailable: boolean;
}

export interface SocialContentPage {
  items: SocialContentItem[];
  nextCursor: string | null;
}

export interface AccountMetricsResult {
  officialViews: number | null;
  availability: 'available' | 'unavailable' | 'partial';
  periodLabel?: string;
  definitionLabel?: string;
}

export interface SocialCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  refreshExpiresAt?: Date;
  scopes: string[];
}

export interface ContentMetricsResult {
  views: number | null;
  viewsAvailable: boolean;
}

export interface SocialMetricsProvider {
  readonly platform: 'instagram' | 'tiktok';
  readonly transport: 'official_api' | 'mcp' | 'demo';

  getAuthorizedProfile(creds: SocialCredentials): Promise<AuthorizedProfile>;
  listContents(
    creds: SocialCredentials,
    cursor?: string | null,
  ): Promise<SocialContentPage>;
  getAccountMetrics(creds: SocialCredentials): Promise<AccountMetricsResult>;
  getContentMetrics(
    creds: SocialCredentials,
    platformContentId: string,
  ): Promise<ContentMetricsResult>;
  refreshCredentials?(creds: SocialCredentials): Promise<SocialCredentials>;
  disconnect(creds: SocialCredentials): Promise<void>;
}
