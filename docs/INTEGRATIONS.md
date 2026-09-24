# Integrações sociais — Embaixadores Acorde Sua Mente

## Matriz de capacidades (validada em 2026-03-24)

### MCPs disponíveis neste ambiente de desenvolvimento

| Servidor MCP | Instagram | TikTok | Observação |
|---|---|---|---|
| Nenhum | — | — | Catálogo Cursor/MCP inspecionado: **não há** servidor MCP de Instagram ou TikTok autenticável/multiusuário. |

Conclusão: o MCP **não** é o transporte ativo. Adaptadores MCP existem apenas como stubs determinísticos que retornam `integration_unavailable`. Sincronização e rankings **não** dependem de LLM.

### Instagram — transporte ativo: `official_api`

| Operação | Suporte | Detalhe |
|---|---|---|
| OAuth / titularidade | Sim | Business Login for Instagram (`graph.instagram.com`) |
| Tipo de conta | Conta profissional (Business/Creator) | Contas pessoais: estado `incompatible_account` |
| Escopos MVP | `instagram_business_basic`, `instagram_business_manage_insights` | App Meta precisa de revisão para produção |
| Perfil | Sim | id, username, avatar, profile URL |
| Listar Reels/mídia | Sim | `/me/media` com paginação por cursor |
| Views por conteúdo | Sim | `GET /{media-id}/insights?metric=views&period=lifetime` |
| Views oficiais da conta | Parcial | Insights de conta com período (`day`/`week`/`days_28`); **não** é soma de vídeos |
| Refresh de token | Sim | Long-lived token / refresh conforme docs Meta |
| Desconectar | Sim | Revogação + limpeza local |

**Pendências externas:** `META_APP_ID`, `META_APP_SECRET`, app em modo Live, permissões aprovadas, redirect URI configurada.

### TikTok — transporte ativo: `official_api`

| Operação | Suporte | Detalhe |
|---|---|---|
| OAuth / titularidade | Sim | Login Kit + PKCE |
| Escopos MVP | `user.info.basic`, `video.list` | Opcional: `user.info.stats` para stats de perfil |
| Perfil | Sim | `open_id`, avatar, display_name, deep link |
| Listar vídeos | Sim | `POST /v2/video/list/` (máx. 20/página, cursor) |
| Views por conteúdo | Sim | campo `view_count` |
| Views oficiais da conta | Indisponível no Display API | Exibir **Indisponível**; `user.info.stats` traz likes/followers/video_count, **não** total de views |
| Refresh de token | Sim | access ~24h; refresh ~365 dias |
| Desconectar | Sim | `/v2/oauth/revoke/` |

**Pendências externas:** app TikTok for Developers, produtos Login Kit + Display API aprovados, `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`, redirect URI.

## Porta `SocialMetricsProvider`

Contrato único usado por sincronização e rankings. Implementações:

| Adapter | Plataforma | Transporte | Quando ativo |
|---|---|---|---|
| `InstagramOfficialApiAdapter` | Instagram | `official_api` | Credenciais Meta presentes |
| `TikTokOfficialApiAdapter` | TikTok | `official_api` | Credenciais TikTok presentes |
| `McpSocialMetricsAdapter` | ambas | `mcp` | Nunca no MVP (stub → `integration_unavailable`) |
| `DemoSocialMetricsAdapter` | ambas | `demo` | Somente `DEMO_MODE=true` |

Cada chamada usa as credenciais criptografadas do **embaixador dono** da conta (`social_credentials`), nunca um token compartilhado.

## Estados de integração (UI/API)

| Estado | Significado |
|---|---|
| `connected` | Token válido, sync recente OK |
| `syncing` | Job em andamento |
| `authorization_expired` | Token/refresh inválido — reconectar |
| `insufficient_permission` | Escopos insuficientes |
| `incompatible_account` | Ex.: Instagram pessoal |
| `integration_unavailable` | Credenciais de app ausentes ou MCP indisponível |

## Critério de ranking (MVP)

- **Total de visualizações:** soma dos contadores acumulados mais recentes dos Reels/vídeos elegíveis monitorados.
- **Melhor vídeo:** maior contador acumulado entre os conteúdos elegíveis do embaixador.
- Rankings **separados** por plataforma (Instagram ≠ TikTok).
- Métricas oficiais de conta aparecem no dashboard, **nunca** substituem a soma dos vídeos silenciosamente.

## URLs de callback (produção)

Base: `https://embaixadores.iamcontrol.com.br`

| Fluxo | URL |
|---|---|
| Confirmação de e-mail (Supabase) | `https://embaixadores.iamcontrol.com.br/auth/callback` |
| Recuperação de senha | `https://embaixadores.iamcontrol.com.br/auth/reset` |
| OAuth Instagram | `https://embaixadores.iamcontrol.com.br/api/social/oauth/instagram/callback` |
| OAuth TikTok | `https://embaixadores.iamcontrol.com.br/api/social/oauth/tiktok/callback` |

Configure as mesmas URLs no Supabase Auth, Meta App e TikTok Developer Portal.
