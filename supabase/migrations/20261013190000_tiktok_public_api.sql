-- TikTok lido pelo @ (dados públicos). A conta só entra no ranking depois que o
-- embaixador confirma a posse colocando o código na bio.
ALTER TYPE public.connection_status ADD VALUE IF NOT EXISTS 'pending_verification';

ALTER TABLE public.social_accounts
  ADD COLUMN IF NOT EXISTS verification_code TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
