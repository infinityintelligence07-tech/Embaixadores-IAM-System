-- Cada rede conectada passa pela equipe antes de entrar no ranking.
ALTER TABLE public.social_accounts
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'social_accounts_review_status_check'
  ) THEN
    ALTER TABLE public.social_accounts
      ADD CONSTRAINT social_accounts_review_status_check
      CHECK (review_status IN ('pending', 'approved', 'changes_requested', 'rejected'));
  END IF;
END $$;

-- Quem já competia continua no ranking sem nova análise.
UPDATE public.social_accounts sa
SET review_status = 'approved',
    reviewed_at = COALESCE(sa.reviewed_at, now())
FROM public.ambassador_memberships m
WHERE m.profile_id = sa.profile_id
  AND m.status = 'approved'
  AND sa.review_status = 'pending'
  AND sa.disconnected_at IS NULL;

CREATE INDEX IF NOT EXISTS social_accounts_review_idx
  ON public.social_accounts (review_status)
  WHERE disconnected_at IS NULL;

-- Candidatura feita já com conta criada aponta para o perfil.
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_note TEXT;

UPDATE public.applications a
SET profile_id = p.id
FROM public.profiles p
WHERE a.profile_id IS NULL AND lower(p.email) = lower(a.email) AND p.deleted_at IS NULL;

-- Avisos da equipe para o embaixador (aprovação, ajuste pedido, reprovação).
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_profile_idx
  ON public.notifications (profile_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Rankings por período: mês (criado sozinho) ou campanha com datas definidas pela equipe.
CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'campaign' CHECK (kind IN ('monthly', 'campaign')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT campaigns_period_check CHECK (ends_at > starts_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS campaigns_monthly_uq
  ON public.campaigns (starts_at) WHERE kind = 'monthly';
CREATE INDEX IF NOT EXISTS campaigns_period_idx ON public.campaigns (starts_at, ends_at);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ranking_versions
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ranking_versions_campaign_idx
  ON public.ranking_versions (campaign_id, platform, category, status, published_at DESC);

INSERT INTO public.app_settings (key, value)
VALUES ('ranking_mode', '"monthly"'::jsonb)
ON CONFLICT (key) DO NOTHING;
