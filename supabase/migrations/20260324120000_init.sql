-- Embaixadores Acorde Sua Mente — schema inicial
-- Horários em UTC (timestamptz). Contadores em bigint.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Papéis e enums
CREATE TYPE public.app_role AS ENUM ('ambassador', 'admin');
CREATE TYPE public.membership_status AS ENUM ('pending', 'approved', 'suspended');
CREATE TYPE public.social_platform AS ENUM ('instagram', 'tiktok');
CREATE TYPE public.connection_status AS ENUM (
  'connected',
  'syncing',
  'authorization_expired',
  'insufficient_permission',
  'incompatible_account',
  'integration_unavailable',
  'disconnected'
);
CREATE TYPE public.sync_job_status AS ENUM (
  'pending', 'running', 'succeeded', 'failed', 'cancelled'
);
CREATE TYPE public.ranking_category AS ENUM ('total_views', 'best_video');
CREATE TYPE public.ranking_version_status AS ENUM (
  'computing', 'published', 'superseded'
);
CREATE TYPE public.metric_availability AS ENUM (
  'available', 'unavailable', 'partial'
);

-- profiles (espelha auth.users; role NÃO vem de user_metadata editável)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  public_name TEXT NOT NULL,
  avatar_url TEXT,
  role public.app_role NOT NULL DEFAULT 'ambassador',
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX profiles_email_uq ON public.profiles (lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX profiles_role_idx ON public.profiles (role);

CREATE TABLE public.ambassador_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.membership_status NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.profiles(id),
  suspended_at TIMESTAMPTZ,
  suspension_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ambassador_memberships_profile_uq UNIQUE (profile_id)
);

CREATE INDEX ambassador_memberships_status_idx
  ON public.ambassador_memberships (status, approved_at);

CREATE TABLE public.social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform public.social_platform NOT NULL,
  platform_user_id TEXT NOT NULL,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  profile_url TEXT,
  status public.connection_status NOT NULL DEFAULT 'connected',
  transport TEXT NOT NULL DEFAULT 'official_api',
  last_synced_at TIMESTAMPTZ,
  last_successful_sync_at TIMESTAMPTZ,
  sync_coverage_ratio NUMERIC(5,4),
  sync_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disconnected_at TIMESTAMPTZ,
  CONSTRAINT social_accounts_platform_user_uq UNIQUE (platform, platform_user_id),
  CONSTRAINT social_accounts_one_per_platform_uq UNIQUE (profile_id, platform)
);

CREATE INDEX social_accounts_profile_idx ON public.social_accounts (profile_id);
CREATE INDEX social_accounts_status_idx ON public.social_accounts (status);

-- Credenciais criptografadas (ciphertext); chave fora do banco
CREATE TABLE public.social_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  social_account_id UUID NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT,
  token_expires_at TIMESTAMPTZ,
  refresh_expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  encryption_kid TEXT NOT NULL DEFAULT 'v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT social_credentials_account_uq UNIQUE (social_account_id)
);

CREATE TABLE public.contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  social_account_id UUID NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  platform public.social_platform NOT NULL,
  platform_content_id TEXT NOT NULL,
  title TEXT,
  thumbnail_url TEXT,
  permalink TEXT,
  published_at TIMESTAMPTZ,
  media_type TEXT,
  eligible BOOLEAN NOT NULL DEFAULT TRUE,
  excluded_at TIMESTAMPTZ,
  exclusion_reason TEXT,
  excluded_by UUID REFERENCES public.profiles(id),
  removed_on_platform BOOLEAN NOT NULL DEFAULT FALSE,
  latest_views BIGINT,
  latest_views_collected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contents_platform_id_uq UNIQUE (platform, platform_content_id)
);

CREATE INDEX contents_account_eligible_idx
  ON public.contents (social_account_id, eligible)
  WHERE removed_on_platform = FALSE;
CREATE INDEX contents_latest_views_idx ON public.contents (latest_views DESC NULLS LAST);

CREATE TABLE public.content_metric_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  views BIGINT,
  views_available BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL,
  period_label TEXT,
  payload JSONB,
  sync_run_id UUID
);

CREATE INDEX content_metric_snapshots_content_collected_idx
  ON public.content_metric_snapshots (content_id, collected_at DESC);

CREATE TABLE public.account_metric_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  social_account_id UUID NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  official_views BIGINT,
  availability public.metric_availability NOT NULL DEFAULT 'unavailable',
  period_label TEXT,
  definition_label TEXT,
  source TEXT NOT NULL,
  payload JSONB,
  sync_run_id UUID
);

CREATE INDEX account_metric_snapshots_account_collected_idx
  ON public.account_metric_snapshots (social_account_id, collected_at DESC);

CREATE TABLE public.sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  social_account_id UUID NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL DEFAULT 'full_sync',
  status public.sync_job_status NOT NULL DEFAULT 'pending',
  priority INT NOT NULL DEFAULT 100,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  checkpoint JSONB,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 8,
  next_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sync_jobs_due_idx
  ON public.sync_jobs (status, next_attempt_at, scheduled_at)
  WHERE status IN ('pending', 'failed');
CREATE UNIQUE INDEX sync_jobs_active_account_uq
  ON public.sync_jobs (social_account_id)
  WHERE status IN ('pending', 'running');

CREATE TABLE public.sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_job_id UUID NOT NULL REFERENCES public.sync_jobs(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status public.sync_job_status NOT NULL DEFAULT 'running',
  items_fetched INT NOT NULL DEFAULT 0,
  items_upserted INT NOT NULL DEFAULT 0,
  coverage_ratio NUMERIC(5,4),
  error_message TEXT,
  metadata JSONB
);

CREATE INDEX sync_runs_account_started_idx
  ON public.sync_runs (social_account_id, started_at DESC);

ALTER TABLE public.content_metric_snapshots
  ADD CONSTRAINT content_metric_snapshots_run_fk
  FOREIGN KEY (sync_run_id) REFERENCES public.sync_runs(id) ON DELETE SET NULL;

ALTER TABLE public.account_metric_snapshots
  ADD CONSTRAINT account_metric_snapshots_run_fk
  FOREIGN KEY (sync_run_id) REFERENCES public.sync_runs(id) ON DELETE SET NULL;

CREATE TABLE public.ranking_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform public.social_platform NOT NULL,
  category public.ranking_category NOT NULL,
  status public.ranking_version_status NOT NULL DEFAULT 'computing',
  computed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  participant_count INT NOT NULL DEFAULT 0,
  stale_tolerance_hours INT NOT NULL DEFAULT 24,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ranking_versions_lookup_idx
  ON public.ranking_versions (platform, category, status, published_at DESC);

CREATE TABLE public.ranking_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ranking_version_id UUID NOT NULL REFERENCES public.ranking_versions(id) ON DELETE CASCADE,
  position INT NOT NULL,
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  public_name TEXT NOT NULL,
  avatar_url TEXT,
  total_views BIGINT NOT NULL DEFAULT 0,
  best_video_views BIGINT NOT NULL DEFAULT 0,
  best_content_id UUID REFERENCES public.contents(id),
  score BIGINT NOT NULL,
  last_synced_at TIMESTAMPTZ,
  is_stale BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT ranking_entries_version_position_uq UNIQUE (ranking_version_id, position),
  CONSTRAINT ranking_entries_version_profile_uq UNIQUE (ranking_version_id, profile_id)
);

CREATE INDEX ranking_entries_version_score_idx
  ON public.ranking_entries (ranking_version_id, position);

CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id)
);

INSERT INTO public.app_settings (key, value) VALUES
  ('sync_interval_minutes', '60'),
  ('stale_tolerance_hours', '24'),
  ('manual_sync_cooldown_seconds', '300');

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_created_idx ON public.audit_logs (created_at DESC);
CREATE INDEX audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id);

CREATE TABLE public.oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform public.social_platform NOT NULL,
  state TEXT NOT NULL UNIQUE,
  code_verifier TEXT,
  redirect_path TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX oauth_states_expires_idx ON public.oauth_states (expires_at);

-- Trigger: criar profile + membership ao confirmar usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_public_name TEXT;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  v_public_name := COALESCE(NEW.raw_user_meta_data->>'public_name', v_full_name);

  INSERT INTO public.profiles (id, email, full_name, public_name)
  VALUES (NEW.id, NEW.email, v_full_name, v_public_name);

  INSERT INTO public.ambassador_memberships (profile_id, status)
  VALUES (NEW.id, 'pending');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER memberships_updated BEFORE UPDATE ON public.ambassador_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER social_accounts_updated BEFORE UPDATE ON public.social_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER social_credentials_updated BEFORE UPDATE ON public.social_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER contents_updated BEFORE UPDATE ON public.contents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER sync_jobs_updated BEFORE UPDATE ON public.sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper: admin check via profiles.role (não via user_metadata)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin' AND p.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_owner(target UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT auth.uid() = target;
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambassador_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_metric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_metric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranking_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranking_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY profiles_select_own_or_admin ON public.profiles
  FOR SELECT USING (is_owner(id) OR is_admin() OR deleted_at IS NULL);
-- public_name visível para rankings; dados sensíveis só via API backend
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE USING (is_owner(id) OR is_admin())
  WITH CHECK (
    (is_owner(id) AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()))
    OR is_admin()
  );

-- memberships
CREATE POLICY memberships_select ON public.ambassador_memberships
  FOR SELECT USING (is_owner(profile_id) OR is_admin());
CREATE POLICY memberships_admin_update ON public.ambassador_memberships
  FOR UPDATE USING (is_admin());

-- social accounts: dono ou admin
CREATE POLICY social_accounts_select ON public.social_accounts
  FOR SELECT USING (is_owner(profile_id) OR is_admin());
CREATE POLICY social_accounts_write ON public.social_accounts
  FOR ALL USING (is_owner(profile_id) OR is_admin());

-- credentials: NUNCA via PostgREST para usuários; apenas service_role / backend
CREATE POLICY social_credentials_deny_all ON public.social_credentials
  FOR ALL USING (false);

-- contents: dono vê os seus; rankings usam backend; admin vê tudo
CREATE POLICY contents_select ON public.contents
  FOR SELECT USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM public.social_accounts sa
      WHERE sa.id = contents.social_account_id AND sa.profile_id = auth.uid()
    )
  );

CREATE POLICY content_snapshots_select ON public.content_metric_snapshots
  FOR SELECT USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM public.contents c
      JOIN public.social_accounts sa ON sa.id = c.social_account_id
      WHERE c.id = content_metric_snapshots.content_id AND sa.profile_id = auth.uid()
    )
  );

CREATE POLICY account_snapshots_select ON public.account_metric_snapshots
  FOR SELECT USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM public.social_accounts sa
      WHERE sa.id = account_metric_snapshots.social_account_id AND sa.profile_id = auth.uid()
    )
  );

CREATE POLICY sync_jobs_select ON public.sync_jobs
  FOR SELECT USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM public.social_accounts sa
      WHERE sa.id = sync_jobs.social_account_id AND sa.profile_id = auth.uid()
    )
  );

CREATE POLICY sync_runs_select ON public.sync_runs
  FOR SELECT USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM public.social_accounts sa
      WHERE sa.id = sync_runs.social_account_id AND sa.profile_id = auth.uid()
    )
  );

-- rankings publicados legíveis por autenticados
CREATE POLICY ranking_versions_select ON public.ranking_versions
  FOR SELECT USING (status = 'published' OR is_admin());

CREATE POLICY ranking_entries_select ON public.ranking_entries
  FOR SELECT USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM public.ranking_versions rv
      WHERE rv.id = ranking_entries.ranking_version_id AND rv.status = 'published'
    )
  );

CREATE POLICY app_settings_select ON public.app_settings
  FOR SELECT USING (is_admin());
CREATE POLICY app_settings_admin ON public.app_settings
  FOR ALL USING (is_admin());

CREATE POLICY audit_logs_admin ON public.audit_logs
  FOR SELECT USING (is_admin());

CREATE POLICY oauth_states_own ON public.oauth_states
  FOR ALL USING (is_owner(profile_id) OR is_admin());
