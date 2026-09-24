# Segurança, consentimento e privacidade

## Consentimento

Ao cadastrar-se e conectar redes, o embaixador consente com:

1. Leitura do perfil e conteúdos públicos/autorizados via OAuth das plataformas.
2. Coleta de métricas de visualização dos vídeos/Reels monitorados.
3. Divulgação do **nome público**, avatar e pontuação nos rankings da plataforma Embaixadores Acorde Sua Mente.

O consentimento é registrado no fluxo de onboarding (aceite obrigatório) e auditável.

## Dados pessoais vs. ranking

| Dado | Uso |
|---|---|
| e-mail, nome completo | Privado (perfil/admin) |
| nome público, avatar | Visível em rankings |
| tokens OAuth | Criptografados no servidor; nunca no frontend |
| visualizações | Usadas para classificação |

## Direitos do usuário

- Desconectar Instagram/TikTok a qualquer momento (revoga token quando a API permitir).
- Solicitar exclusão de conta: soft-delete do perfil, remoção de credenciais, exclusão/anonimização de entradas pessoais conforme retenção.
- Conteúdos excluídos da competição por admin exigem justificativa em `audit_logs`.

## Retenção

| Dado | Política padrão |
|---|---|
| Snapshots de métricas | 180 dias (configurável) |
| Logs de sync / auditoria | 365 dias |
| Credenciais sociais | Até desconexão ou exclusão de conta |
| Rankings publicados | Mantidos para histórico; versões superseded retidas 90 dias |

## Controles técnicos

- Senhas apenas no Supabase Auth.
- `TOKEN_ENCRYPTION_KEY` fora do banco.
- `service_role` e secrets só no backend/VPS.
- OAuth com `state` e PKCE (TikTok).
- Rate limiting (Throttler) nas rotas de auth e OAuth.
- RLS no Supabase; autorização real no backend NestJS.
- Admin não pode editar manualmente contadores oficiais de visualizações.
