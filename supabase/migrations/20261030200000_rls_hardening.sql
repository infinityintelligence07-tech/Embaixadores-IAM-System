-- O navegador nunca lê nem grava tabelas direto: tudo passa pela API, que usa o papel do servidor.
-- Estas regras fecham o acesso direto pela chave pública do Supabase.

-- Perfil: cada pessoa vê só o próprio; a equipe vê todos. Ninguém altera o perfil por fora da API.
DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
CREATE POLICY profiles_select_own_or_admin ON public.profiles
  FOR SELECT USING (is_owner(id) OR is_admin());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_update ON public.profiles;
CREATE POLICY profiles_admin_update ON public.profiles
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

-- Contas das redes: o embaixador só lê a própria; aprovação e alterações só pela API ou pela equipe.
DROP POLICY IF EXISTS social_accounts_write ON public.social_accounts;
DROP POLICY IF EXISTS social_accounts_admin_write ON public.social_accounts;
CREATE POLICY social_accounts_admin_write ON public.social_accounts
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS oauth_states_own ON public.oauth_states;
DROP POLICY IF EXISTS oauth_states_admin ON public.oauth_states;
CREATE POLICY oauth_states_admin ON public.oauth_states
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Ranking publicado: só para quem está logado.
DROP POLICY IF EXISTS ranking_versions_select ON public.ranking_versions;
CREATE POLICY ranking_versions_select ON public.ranking_versions
  FOR SELECT USING (is_admin() OR (auth.uid() IS NOT NULL AND status = 'published'));

DROP POLICY IF EXISTS ranking_entries_select ON public.ranking_entries;
CREATE POLICY ranking_entries_select ON public.ranking_entries
  FOR SELECT USING (
    is_admin() OR (
      auth.uid() IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.ranking_versions rv
        WHERE rv.id = ranking_entries.ranking_version_id AND rv.status = 'published'
      )
    )
  );
