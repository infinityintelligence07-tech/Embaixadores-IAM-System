# Critérios de aceite — checklist MVP

## Autenticação e isolamento
- [ ] Cadastro com nome, nome público, e-mail, senha (Supabase Auth)
- [ ] Confirmação de e-mail e recuperação de senha
- [ ] JWT validado no backend; role lida de `profiles.role` (não de user_metadata)
- [ ] Rotas `/api/admin/*` bloqueadas para não-admin

## Contas sociais
- [ ] OAuth Instagram/TikTok (ou DEMO_MODE)
- [ ] UNIQUE `(platform, platform_user_id)` impede conta duplicada
- [ ] Callback OAuth sem Bearer (público) funciona
- [ ] Sync manual respeita cooldown

## Rankings
- [ ] Top 3 / Top 10 / geral da mesma `ranking_versions` publicada
- [ ] Categorias total_views e best_video; plataformas separadas
- [ ] Posição pessoal independente de busca/paginação
- [ ] Inelegível mostra motivo, não posição fictícia

## Sync e falhas
- [ ] Falha de API não zera `latest_views` válidos
- [ ] Publicação atômica de rankings
- [ ] Dados além da tolerância saem do ranking

## Segurança frontend
- [ ] Bundle sem `SERVICE_ROLE` / secrets (apenas `VITE_SUPABASE_ANON_KEY`)

## Pendências externas
- Credenciais Meta / TikTok / Supabase / TLS VPS
