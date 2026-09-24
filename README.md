# Embaixadores Acorde Sua Mente

Plataforma para cadastro, autenticação, acompanhamento de desempenho e classificação de embaixadores que produzem cortes para Instagram e TikTok.

**Produção:** https://embaixadores.iamcontrol.com.br

## Stack

- Monólito modular (arquitetura hexagonal)
- Frontend: React + Vite + Tailwind (TypeScript)
- Backend: NestJS (TypeScript) — API + estáticos na mesma origem
- Auth/DB: Supabase Auth + PostgreSQL gerenciado
- Deploy: Docker Compose + Nginx na VPS Hostinger; DNS Cloudflare

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Camadas e módulos |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) | Instagram, TikTok, MCPs, transporte ativo |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Modelo e diagrama |
| [docs/SECURITY_PRIVACY.md](docs/SECURITY_PRIVACY.md) | Consentimento, retenção, segurança |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | VPS, Cloudflare, HTTPS, backup |

## Premissas do MVP

- Rankings **separados** por plataforma (não soma IG + TT).
- Categorias: **Total de visualizações** (soma dos vídeos monitorados) e **Melhor vídeo**.
- Métrica oficial de conta no dashboard; se indisponível → **"Indisponível"** (nunca substituída pela soma).
- Sem MCP oficial de Instagram/TikTok neste ambiente → transporte ativo: **API oficial**.
- Dados simulados somente com `DEMO_MODE=true`.


O código das integrações oficiais está implementado; o fluxo ponta a ponta só completa após credenciais e apps aprovados.

## Licença

Uso interno — Acorde Sua Mente / IAM Control.
