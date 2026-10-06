-- Candidaturas do formulário público, no mesmo banco da área.

CREATE TABLE IF NOT EXISTS public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_completo TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  nome_conta TEXT NOT NULL,
  redes_sociais TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS applications_email_uq ON public.applications (lower(email));
CREATE INDEX IF NOT EXISTS applications_status_idx ON public.applications (status, created_at DESC);

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
