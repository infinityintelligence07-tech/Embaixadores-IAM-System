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
  | 'disconnected'
  | 'pending_verification';
export type RankingView = 'top3' | 'top10' | 'all';
export type RankingCategory = 'total_views' | 'best_video';

/** Decisão da equipe sobre a conta: só `approved` entra no ranking. */
export type AccountReviewStatus = 'pending' | 'approved' | 'changes_requested' | 'rejected';
export type ReviewDecision = Exclude<AccountReviewStatus, 'pending'>;

/** Uma conta de rede de um embaixador, como a equipe vê no quadro de aprovações. */
export interface AdminAccount {
  accountId: string;
  platform: SocialPlatform;
  username: string | null;
  profileUrl: string | null;
  reviewStatus: AccountReviewStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  connectedAt: string;
  lastSyncAt: string | null;
  views: number;
  profileId: string;
  fullName: string;
  publicName: string;
  email: string;
  whatsapp: string | null;
  membershipStatus: UserStatus | null;
}

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export type CampaignState = 'scheduled' | 'active' | 'finished';
export type RankingMode = 'monthly' | 'campaign';

export interface Campaign {
  id: string;
  name: string;
  kind: 'monthly' | 'campaign';
  startsAt: string;
  endsAt: string;
  firstDay: string;
  lastDay: string;
  state: CampaignState;
}

/** Valor de campanha para o ranking desde o início, sem período. */
export const GENERAL_RANKING = 'geral';

export interface SignupPayload {
  nome_completo: string;
  email: string;
  whatsapp: string;
  password: string;
  ranking_consent: boolean;
}

export interface MeResponse {
  id: string;
  email: string;
  fullName: string;
  publicName: string;
  avatarUrl: string | null;
  role: UserRole;
  status: UserStatus;
  onboardingCompleted: boolean;
  /** Entrou pelo Google e ainda falta o WhatsApp. */
  needsSignupDetails: boolean;
  createdAt: string;
}

export interface CompleteSignupPayload {
  whatsapp: string;
  ranking_consent: boolean;
}

export interface DashboardAccount {
  id: string;
  platform: SocialPlatform;
  username: string | null;
  views: number;
  reviewStatus: AccountReviewStatus;
  lastSyncAt: string | null;
}

export interface DashboardResponse {
  /** Views desde o início, somando todas as contas aprovadas. */
  totalViews: number;
  byPlatform: Record<SocialPlatform, number>;
  bestVideo: {
    id: string;
    title: string | null;
    views: number;
    permalink: string | null;
    platform: SocialPlatform;
    username: string | null;
  } | null;
  lastSyncAt: string | null;
  accounts: DashboardAccount[];
  rankingCriteria: string;
}

export interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  username: string | null;
  status: ConnectionStatus;
  transport: 'official_api' | 'public_api' | 'mcp' | 'demo';
  lastSyncAt: string | null;
  syncMessage: string | null;
  verificationCode: string | null;
  reviewStatus: AccountReviewStatus;
  reviewNote: string | null;
  /** Views elegíveis dessa conta desde o início. */
  views: number;
  createdAt: string;
}

export interface GrowthResponse {
  platform: SocialPlatform | null;
  /** Views somadas no fim de cada dia, da primeira medição até hoje. */
  points: { day: string; views: number }[];
  current: number | null;
  /** Views ganhas nos últimos 7 dias; null enquanto não há uma semana de medição. */
  lastWeek: number | null;
}

export interface ContentItem {
  id: string;
  platform: SocialPlatform;
  accountId: string;
  username: string | null;
  title: string;
  url: string;
  views: number;
  publishedAt: string;
  thumbnailUrl: string | null;
  excluded: boolean;
  /** Entra no ranking: vídeo, não retirado, com o Marcos citado na legenda. */
  counts: boolean;
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

/** Perfil público de quem disputa o ranking: contas aprovadas e os vídeos que mais renderam. */
export interface AmbassadorProfile {
  id: string;
  publicName: string;
  avatarUrl: string | null;
  position: number | null;
  participants: number;
  totalViews: number;
  accounts: {
    id: string;
    platform: SocialPlatform;
    username: string | null;
    profileUrl: string | null;
    views: number;
  }[];
  videos: {
    id: string;
    platform: SocialPlatform;
    username: string | null;
    title: string | null;
    views: number;
    url: string | null;
    thumbnailUrl: string | null;
    publishedAt: string | null;
  }[];
}

export interface RankingsResponse {
  items: RankingEntry[];
  page: number;
  pageSize: number;
  total: number;
  view: RankingView;
  category: RankingCategory;
  platform: SocialPlatform | null;
  campaignId?: string;
}

export interface MyRankingResponse {
  eligible: boolean;
  reason: string | null;
  position: number | null;
  total: number;
  score: number | null;
  gapToAbove: number | null;
  category: RankingCategory;
  platform: SocialPlatform | null;
  entry: RankingEntry | null;
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  publicName: string;
  /** Do cadastro; null para quem ainda não informou. */
  whatsapp: string | null;
  status: UserStatus;
  role: UserRole;
  createdAt: string;
  postsLast30Days: number;
  contentCount: number;
  lastPublishedAt: string | null;
  daysWithoutPosting: number | null;
}

export interface AdminSyncJob {
  id: string;
  profileId: string | null;
  platform: SocialPlatform | null;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  publicName?: string | null;
  username?: string | null;
}

export interface AdminAuditEntry {
  id: string;
  action: string;
  actorId: string | null;
  actorName?: string | null;
  entityType: string;
  entityId: string | null;
  entityName?: string | null;
  reason: string | null;
  createdAt: string;
}

export interface AdminSettings {
  syncIntervalMinutes: number;
  staleToleranceHours: number;
  manualSyncCooldownSeconds: number;
}

// Textos padrão do servidor que nunca devem aparecer na interface.
const GENERIC_SERVER_MESSAGES = new Set([
  'internal server error',
  'bad request',
  'unauthorized',
  'forbidden',
  'not found',
  'bad gateway',
  'service unavailable',
  'gateway timeout',
]);

function fallbackMessage(status: number): string {
  if (status === 401) return 'Sua sessão expirou. Entre de novo para continuar.';
  if (status === 403) return 'Você não tem permissão para fazer isso.';
  if (status === 404) return 'Não encontramos o que você procurava.';
  if (status === 429) return 'Muitas tentativas em pouco tempo. Aguarde um pouco e tente de novo.';
  if (status >= 500) return 'Algo deu errado do nosso lado. Tente de novo em instantes.';
  return 'Não foi possível concluir. Revise os dados e tente de novo.';
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

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError('Sem conexão com o servidor. Verifique a internet e tente de novo.', 0);
  }

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }

    const raw =
      typeof body === 'object' && body !== null && 'message' in body
        ? (body as { message: unknown }).message
        : undefined;
    const fromServer = Array.isArray(raw)
      ? raw.find((item): item is string => typeof item === 'string')
      : typeof raw === 'string'
        ? raw
        : undefined;

    throw new ApiError(
      fromServer && !GENERIC_SERVER_MESSAGES.has(fromServer.trim().toLowerCase())
        ? fromServer
        : fallbackMessage(response.status),
      response.status,
      body,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  me: () => fetchJson<MeResponse>('/api/me'),

  dashboard: () => fetchJson<DashboardResponse>('/api/dashboard'),

  ambassador: (id: string) =>
    fetchJson<AmbassadorProfile>(`/api/ambassadors/${encodeURIComponent(id)}`),

  socialAccounts: () => fetchJson<SocialAccount[]>('/api/social/accounts'),

  /** Sempre adiciona uma conta nova; o mesmo @ já ativo volta como está, sem duplicar. */
  addAccount: (platform: SocialPlatform, handle: string) =>
    fetchJson<SocialAccount>(`/api/social/${platform}/handle`, {
      method: 'POST',
      body: JSON.stringify({ handle }),
    }),

  deleteSocialAccount: (id: string) =>
    fetchJson<void>(`/api/social/accounts/${id}`, { method: 'DELETE' }),

  syncSocialAccount: (id: string) =>
    fetchJson<{ ok: boolean }>(`/api/social/accounts/${id}/sync`, {
      method: 'POST',
    }),

  /** Com `campaignId`, `views` são as ganhas dentro do período, como no ranking dele. */
  contents: (campaignId?: string) =>
    fetchJson<ContentItem[]>(
      campaignId ? `/api/contents?campaignId=${encodeURIComponent(campaignId)}` : '/api/contents',
    ),

  /** Sem `platform`, o ranking geral (todas as contas). Com `platform`, só aquela rede. */
  rankings: (params: {
    platform?: SocialPlatform;
    category?: RankingCategory;
    view?: RankingView;
    q?: string;
    page?: number;
    pageSize?: number;
    campaign?: string;
  }) => {
    const search = new URLSearchParams();
    if (params.platform) search.set('platform', params.platform);
    if (params.category) search.set('category', params.category);
    if (params.view) search.set('view', params.view);
    if (params.q) search.set('q', params.q);
    if (params.page) search.set('page', String(params.page));
    if (params.pageSize) search.set('pageSize', String(params.pageSize));
    if (params.campaign) search.set('campaign', params.campaign);
    const query = search.toString();
    return fetchJson<RankingsResponse>(`/api/rankings${query ? `?${query}` : ''}`);
  },

  /** Mesma regra de `rankings`: sem `platform`, a posição no geral. */
  myRanking: (params?: {
    platform?: SocialPlatform;
    category?: RankingCategory;
    campaign?: string;
  }) => {
    const search = new URLSearchParams();
    if (params?.platform) search.set('platform', params.platform);
    if (params?.category) search.set('category', params.category);
    if (params?.campaign) search.set('campaign', params.campaign);
    const query = search.toString();
    return fetchJson<MyRankingResponse>(
      `/api/rankings/me${query ? `?${query}` : ''}`,
    );
  },

  rankingCampaigns: () =>
    fetchJson<{ defaultId: string; items: Campaign[] }>('/api/rankings/campaigns'),

  notifications: () => fetchJson<AppNotification[]>('/api/notifications'),

  markNotificationRead: (id: string) =>
    fetchJson<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: 'POST' }),

  requestAccountReview: (id: string) =>
    fetchJson<SocialAccount>(`/api/social/accounts/${id}/request-review`, { method: 'POST' }),

  /** Quem entrou pelo Google completa o WhatsApp. */
  completeSignup: (payload: CompleteSignupPayload) =>
    fetchJson<{ id: string }>('/api/applications/complete', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /** Cadastro público: cria a conta na hora com a senha escolhida. */
  signup: (payload: SignupPayload) =>
    fetchJson<{ id: string; accountCreated: true }>('/api/applications', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  adminAccounts: () => fetchJson<AdminAccount[]>('/api/admin/accounts'),

  adminReviewAccount: (id: string, decision: ReviewDecision, note?: string) =>
    fetchJson<{ id: string; reviewStatus: AccountReviewStatus; reviewNote: string | null }>(
      `/api/admin/accounts/${id}/review`,
      { method: 'POST', body: JSON.stringify(note ? { decision, note } : { decision }) },
    ),

  adminCampaigns: () =>
    fetchJson<{ mode: RankingMode; items: Campaign[] }>('/api/admin/campaigns'),

  adminCreateCampaign: (payload: { name: string; startDate: string; endDate: string }) =>
    fetchJson<Campaign>('/api/admin/campaigns', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  adminDeleteCampaign: (id: string) =>
    fetchJson<{ ok: boolean }>(`/api/admin/campaigns/${id}`, { method: 'DELETE' }),

  adminSetRankingMode: (mode: RankingMode) =>
    fetchJson<{ mode: RankingMode }>('/api/admin/ranking-mode', {
      method: 'PATCH',
      body: JSON.stringify({ mode }),
    }),

  updateProfile: (payload: {
    fullName?: string;
    publicName?: string;
    onboardingCompleted?: boolean;
  }) =>
    fetchJson<MeResponse>('/api/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  /** `image` é a foto já recortada no aparelho, em data URL JPEG. */
  uploadAvatar: (image: string) =>
    fetchJson<MeResponse>('/api/me/avatar', {
      method: 'POST',
      body: JSON.stringify({ image }),
    }),

  removeAvatar: () => fetchJson<MeResponse>('/api/me/avatar', { method: 'DELETE' }),

  growth: () => fetchJson<GrowthResponse>('/api/dashboard/growth'),

  requestAccountDeletion: () =>
    fetchJson<{ ok: boolean }>('/api/me/delete-request', { method: 'POST' }),

  adminUsers: () => fetchJson<AdminUser[]>('/api/admin/users'),

  adminApproveUser: (id: string) =>
    fetchJson<AdminUser>(`/api/admin/users/${id}/approve`, { method: 'POST' }),

  adminSuspendUser: (id: string) =>
    fetchJson<AdminUser>(`/api/admin/users/${id}/suspend`, { method: 'POST' }),

  adminSyncs: () => fetchJson<AdminSyncJob[]>('/api/admin/syncs'),

  adminRequestSync: (accountId: string) =>
    fetchJson<AdminSyncJob>('/api/admin/syncs', {
      method: 'POST',
      body: JSON.stringify({ accountId }),
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
