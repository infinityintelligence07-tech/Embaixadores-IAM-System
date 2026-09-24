import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type UserRole = 'ambassador' | 'admin';
export type UserStatus = 'pending' | 'approved' | 'suspended';
export type SocialPlatform = 'instagram' | 'tiktok';
export type ConnectionStatus =
  | 'connected'
  | 'syncing'
  | 'authorization_expired'
  | 'insufficient_permission'
  | 'incompatible_account'
  | 'integration_unavailable'
  | 'disconnected';
export type RankingView = 'top3' | 'top10' | 'all';
export type RankingCategory = 'total_views' | 'best_video';

export interface MeResponse {
  id: string;
  email: string;
  fullName: string;
  publicName: string;
  avatarUrl: string | null;
  role: UserRole;
  status: UserStatus;
  onboardingCompleted: boolean;
  createdAt: string;
}

export interface PlatformDashboardSlice {
  platform: SocialPlatform;
  positionTotal: number | null;
  positionBest: number | null;
  totalParticipants: number | null;
  ineligibilityReason: string | null;
  monitoredViewsTotal: number | null;
  bestVideo: {
    id: string;
    title: string | null;
    views: number;
    permalink: string | null;
  } | null;
  officialAccountViews: number | null;
  officialAccountViewsLabel: string;
  contentCount: number;
  lastSyncAt: string | null;
  connectionStatus: ConnectionStatus | null;
  syncCoverageRatio: number | null;
}

export interface DashboardResponse {
  slices: PlatformDashboardSlice[];
  rankingCriteria: string;
}

export interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  username: string | null;
  status: ConnectionStatus;
  transport: 'official_api' | 'mcp' | 'demo';
  lastSyncAt: string | null;
  syncMessage: string | null;
}

export interface ContentItem {
  id: string;
  platform: SocialPlatform;
  title: string;
  url: string;
  views: number;
  publishedAt: string;
  thumbnailUrl: string | null;
  excluded: boolean;
}

export interface RankingEntry {
  position: number;
  profileId: string;
  publicName: string;
  avatarUrl: string | null;
  score: number;
  totalViews: number;
  bestVideoViews: number;
  isStale: boolean;
  isCurrentUser: boolean;
}

export interface RankingsResponse {
  items: RankingEntry[];
  page: number;
  pageSize: number;
  total: number;
  view: RankingView;
  category: RankingCategory;
  platform: SocialPlatform | null;
}

export interface MyRankingResponse {
  eligible: boolean;
  reason: string | null;
  position: number | null;
  total: number;
  score: number | null;
  gapToAbove: number | null;
  category: RankingCategory;
  platform: SocialPlatform;
  entry: RankingEntry | null;
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  publicName: string;
  status: UserStatus;
  role: UserRole;
  createdAt: string;
}

export interface AdminSyncJob {
  id: string;
  profileId: string;
  platform: SocialPlatform;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
}

export interface AdminAuditEntry {
  id: string;
  action: string;
  actorId: string | null;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface AdminSettings {
  syncIntervalMinutes: number;
  staleToleranceHours: number;
  manualSyncCooldownSeconds: number;
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function fetchJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);

  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, { ...init, headers });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }

    const message =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof (body as { message: unknown }).message === 'string'
        ? (body as { message: string }).message
        : `Erro ${response.status}`;

    throw new ApiError(message, response.status, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  me: () => fetchJson<MeResponse>('/api/me'),

  dashboard: () => fetchJson<DashboardResponse>('/api/dashboard'),

  socialAccounts: () => fetchJson<SocialAccount[]>('/api/social/accounts'),

  startOAuth: (platform: SocialPlatform) =>
    fetchJson<{ url: string }>(`/api/social/oauth/${platform}/start`, {
      method: 'POST',
    }),

  deleteSocialAccount: (id: string) =>
    fetchJson<void>(`/api/social/accounts/${id}`, { method: 'DELETE' }),

  syncSocialAccount: (id: string) =>
    fetchJson<{ ok: boolean }>(`/api/social/accounts/${id}/sync`, {
      method: 'POST',
    }),

  contents: () => fetchJson<ContentItem[]>('/api/contents'),

  rankings: (params: {
    platform?: SocialPlatform;
    category?: RankingCategory;
    view?: RankingView;
    q?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const search = new URLSearchParams();
    if (params.platform) search.set('platform', params.platform);
    if (params.category) search.set('category', params.category);
    if (params.view) search.set('view', params.view);
    if (params.q) search.set('q', params.q);
    if (params.page) search.set('page', String(params.page));
    if (params.pageSize) search.set('pageSize', String(params.pageSize));
    const query = search.toString();
    return fetchJson<RankingsResponse>(`/api/rankings${query ? `?${query}` : ''}`);
  },

  myRanking: (params?: { platform?: SocialPlatform; category?: RankingCategory }) => {
    const search = new URLSearchParams();
    if (params?.platform) search.set('platform', params.platform);
    if (params?.category) search.set('category', params.category);
    const query = search.toString();
    return fetchJson<MyRankingResponse>(
      `/api/rankings/me${query ? `?${query}` : ''}`,
    );
  },

  updateProfile: (payload: {
    fullName?: string;
    publicName?: string;
    avatarUrl?: string;
    onboardingCompleted?: boolean;
  }) =>
    fetchJson<MeResponse>('/api/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  requestAccountDeletion: () =>
    fetchJson<{ ok: boolean }>('/api/me/delete-request', { method: 'POST' }),

  adminUsers: () => fetchJson<AdminUser[]>('/api/admin/users'),

  adminApproveUser: (id: string) =>
    fetchJson<AdminUser>(`/api/admin/users/${id}/approve`, { method: 'POST' }),

  adminSuspendUser: (id: string) =>
    fetchJson<AdminUser>(`/api/admin/users/${id}/suspend`, { method: 'POST' }),

  adminSyncs: () => fetchJson<AdminSyncJob[]>('/api/admin/syncs'),

  adminRequestSync: (userId: string, platform: SocialPlatform) =>
    fetchJson<AdminSyncJob>('/api/admin/syncs', {
      method: 'POST',
      body: JSON.stringify({ userId, platform }),
    }),

  adminExcludeContent: (id: string, reason: string) =>
    fetchJson<ContentItem>(`/api/admin/contents/${id}/exclude`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  adminRecalculateRankings: () =>
    fetchJson<{ ok: boolean }>('/api/admin/rankings/recalculate', {
      method: 'POST',
    }),

  adminSettings: () => fetchJson<AdminSettings>('/api/admin/settings'),

  adminUpdateSettings: (payload: Partial<AdminSettings>) =>
    fetchJson<AdminSettings>('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  adminAudit: () => fetchJson<AdminAuditEntry[]>('/api/admin/audit'),
};
