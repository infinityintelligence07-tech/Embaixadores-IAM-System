-- Dados do formulário separados por rede e trilha de quem revisou a candidatura.

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS instagram_handle TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_handle TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Candidaturas antigas só guardavam "Instagram @x · TikTok @y" em nome_conta.
UPDATE public.applications
SET instagram_handle = COALESCE(instagram_handle, substring(nome_conta FROM 'Instagram (@[^[:space:]·]+)')),
    tiktok_handle = COALESCE(tiktok_handle, substring(nome_conta FROM 'TikTok (@[^[:space:]·]+)'))
WHERE instagram_handle IS NULL OR tiktok_handle IS NULL;
