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

/**
 * Thrown when the platform rejects the credentials (expired, revoked or invalid token).
 * The sync pipeline must stop retrying and ask the user to reconnect.
 */
export class SocialAuthError extends Error {
  readonly code: string | number | null;

  constructor(message = 'A autorização da rede social expirou.', code: string | number | null = null) {
    super(message);
    this.name = 'SocialAuthError';
    this.code = code;
  }
}

/**
 * Thrown when the platform throttles our requests.
 * The sync pipeline should retry later with a longer backoff.
 */
export class SocialRateLimitError extends Error {
  readonly code: string | number | null;

  constructor(message = 'A rede social limitou as consultas.', code: string | number | null = null) {
    super(message);
    this.name = 'SocialRateLimitError';
    this.code = code;
  }
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
