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

## Desenvolvimento local

### Pré-requisitos

- Node.js 22+
- Projeto Supabase (URL, anon key, service role, JWT secret, `DATABASE_URL`)
- (Opcional) App Meta Instagram e TikTok for Developers

### 1. Variáveis

```bash
cp .env.example .env
# Preencha SUPABASE_* e DATABASE_URL
# Frontend:
cp .env.example frontend/.env
# VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
```

### 2. Banco

No SQL Editor do Supabase (ou CLI), aplique:

`supabase/migrations/20260324120000_init.sql`

### 3. Backend

```bash
cd backend
npm install
npm run start:dev
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

API em `http://localhost:3000`, Vite proxy `/api` → backend.

### 5. Modo demonstração

```env
DEMO_MODE=true
```

Habilita adaptador demo (dados artificiais identificados). Sem credenciais Meta/TikTok, conexões reais ficam `integration_unavailable` com mensagem clara.

### 6. Testes

```bash
cd backend && npm test
cd frontend && npm test
```

## Produção (resumo)

1. DNS A `embaixadores` → IP da VPS (Cloudflare Proxied).
2. SSL origem + Cloudflare **Full (Strict)**.
3. `docker compose up -d` com `.env` preenchido.
4. Registrar callbacks OAuth e Auth nas plataformas (URLs em `docs/INTEGRATIONS.md`).

Detalhes: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## O que depende de aprovação externa

| Item | Status típico |
|---|---|
| Supabase projeto + migrations | Você configura |
| Meta App + escopos Instagram | Pendente de criação/revisão |
| TikTok Login Kit + Display API | Pendente de criação/aprovação |
| Certificado TLS / IP VPS | Infraestrutura do cliente |

O código das integrações oficiais está implementado; o fluxo ponta a ponta só completa após credenciais e apps aprovados.

## Licença

Uso interno — Acorde Sua Mente / IAM Control.
