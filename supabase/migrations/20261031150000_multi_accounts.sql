-- Várias contas por pessoa (até 5 ativas por rede, limite aplicado pela API) e ranking único,
-- somando todas as contas aprovadas. Pode rodar mais de uma vez.

-- 1. Uma pessoa pode ter várias contas na mesma rede. A posse do @ continua única por rede
--    (social_accounts_platform_user_uq), então duas pessoas não disputam a mesma conta.
ALTER TABLE public.social_accounts
  DROP CONSTRAINT IF EXISTS social_accounts_one_per_platform_uq;

CREATE INDEX IF NOT EXISTS social_accounts_profile_platform_active_idx
  ON public.social_accounts (profile_id, platform)
  WHERE disconnected_at IS NULL;

-- 2. Ranking geral de todas as redes: platform NULL (o padrão do app). Os quadros por rede
--    continuam com platform 'instagram' e 'tiktok', agora somando todas as contas aprovadas
--    da pessoa naquela rede; a próxima publicação substitui as versões antigas.
ALTER TABLE public.ranking_versions
  ALTER COLUMN platform DROP NOT NULL;

CREATE INDEX IF NOT EXISTS ranking_versions_all_networks_idx
  ON public.ranking_versions (category, campaign_id, status, published_at DESC)
  WHERE platform IS NULL;

-- 3. A participação nasce aprovada no cadastro. Quem já se cadastrou e esperava a equipe
--    entra agora; a equipe passa a aprovar só as contas. Candidatura reprovada pela equipe
--    fica como está (a pessoa continua "aguardando" e a equipe decide em Pessoas).
UPDATE public.ambassador_memberships m
SET status = 'approved',
    approved_at = COALESCE(m.approved_at, now()),
    updated_at = now()
WHERE m.status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM public.applications a
    JOIN public.profiles p ON p.id = m.profile_id
    WHERE (a.profile_id = m.profile_id OR lower(a.email) = lower(p.email))
      AND a.status IN ('pending', 'approved')
  );

UPDATE public.applications
SET status = 'approved',
    updated_at = now()
WHERE status = 'pending';
