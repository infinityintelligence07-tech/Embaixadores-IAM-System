# Backend Implementation Summary

## ✅ Implementação Completa

### Arquitetura Hexagonal
A aplicação segue rigorosamente a arquitetura hexagonal:
- **Domínio** (`src/domain/*`): Entidades, tipos, regras de negócio puras
- **Portas** (`src/ports/*`): Interfaces de repositórios, auth, social, etc.
- **Adaptadores** (`src/adapters/*`): Implementações concretas
- **Aplicação** (`src/application/*`): Casos de uso orquestrando domínio e portas
- **Infraestrutura** (`src/infrastructure/*`): Config, DB pool, scheduler, DI tokens

### Arquivos Criados

#### Infrastructure
- `infrastructure/config/env.ts` - Carregamento e validação de variáveis de ambiente
- `infrastructure/db/pool.ts` - Pool de conexões PostgreSQL
- `infrastructure/db/migrate.ts` - Runner de migrações SQL
- `infrastructure/db/seed-demo.ts` - Seed de dados demo (DEMO_MODE)
- `infrastructure/tokens/injection-tokens.ts` - Tokens de injeção de dependência
- `infrastructure/scheduler/sync-scheduler.service.ts` - Scheduler de sync a cada minuto

#### Adaptadores - Auth & Crypto
- `adapters/auth/supabase-auth.adapter.ts` - Verificação JWT via Supabase
- `adapters/crypto/aes-token-encryption.adapter.ts` - Criptografia AES-256-GCM para tokens
- `adapters/clock/system-clock.adapter.ts` - Clock do sistema

#### Adaptadores - Social
- `adapters/social/instagram-official.adapter.ts` - Instagram Graph API
- `adapters/social/tiktok-official.adapter.ts` - TikTok Display API v2 com PKCE
- `adapters/social/mcp-social.adapter.ts` - Placeholder MCP (sempre retorna unavailable)
- `adapters/social/demo-social.adapter.ts` - Dados fake determinísticos para testes
- `adapters/social/social-provider.factory.ts` - Factory para providers

#### Adaptadores - Persistence (PostgreSQL)
- `adapters/persistence/pg/profile.repository.ts`
- `adapters/persistence/pg/membership.repository.ts`
- `adapters/persistence/pg/social-account.repository.ts` - Com criptografia de credenciais
- `adapters/persistence/pg/content.repository.ts` - **Nunca sobrescreve latest_views válido com null**
- `adapters/persistence/pg/metrics.repository.ts`
- `adapters/persistence/pg/sync-job.repository.ts` - Com SKIP LOCKED para concorrência
- `adapters/persistence/pg/ranking.repository.ts` - Publicação atômica com transação
- `adapters/persistence/pg/audit.repository.ts`
- `adapters/persistence/pg/settings.repository.ts`
- `adapters/persistence/pg/oauth-state.repository.ts`

#### Aplicação - Casos de Uso
- `application/identity/get-me.use-case.ts`
- `application/identity/update-me.use-case.ts`
- `application/dashboard/get-dashboard.use-case.ts`
- `application/social/start-oauth.use-case.ts` - OAuth start com state + PKCE
- `application/social/oauth-callback.use-case.ts` - Exchange, unique constraint, enqueue sync
- `application/sync/sync-account.use-case.ts` - Full sync com pagination, backoff, checkpoint
- `application/rankings/compute-and-publish.use-case.ts` - Compute + publish atômico

#### HTTP Layer
- `adapters/http/guards/auth.guard.ts` - **Role do DB, não do JWT**
- `adapters/http/guards/admin.guard.ts`
- `adapters/http/dto/update-profile.dto.ts`
- `adapters/http/controllers/health.controller.ts`
- `adapters/http/controllers/identity.controller.ts` - GET/PATCH /api/me
- `adapters/http/controllers/dashboard.controller.ts` - GET /api/dashboard
- `adapters/http/controllers/social.controller.ts` - OAuth start/callback, list, disconnect
- `adapters/http/controllers/rankings.controller.ts` - GET /api/rankings, /api/rankings/me
- `adapters/http/controllers/contents.controller.ts` - GET /api/contents
- `adapters/http/controllers/admin.controller.ts` - Admin endpoints completos

#### Main & Module
- `main.ts` - Bootstrap com Helmet, CORS, ValidationPipe, serve frontend estático
- `app.module.ts` - DI completo com todos os providers e controllers

#### Testes
- `domain/ranking-rules.spec.ts` - Testes de ordenação, posições, consistência top3/top10
- `domain/eligibility.spec.ts` - Testes de elegibilidade e stale marking
- `vitest.config.ts` - Configuração vitest

## ✅ TypeScript & Testes

```bash
npx tsc --noEmit  # ✅ PASS - 0 erros
npx vitest run    # ✅ PASS - 13 testes passando
```

## 🔐 Variáveis de Ambiente Obrigatórias

### Sempre necessárias (app não inicia sem elas):
```env
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=...  # ou JWT_SECRET
TOKEN_ENCRYPTION_KEY=...  # 32 bytes hex ou base64
APP_BASE_URL=http://localhost:3000
PORT=3000
CORS_ORIGIN=*
```

### Opcionais (integração official_api):
```env
META_APP_ID=...           # Instagram - sem isso, OAuth retorna erro claro
META_APP_SECRET=...
TIKTOK_CLIENT_KEY=...     # TikTok - sem isso, OAuth retorna erro claro
TIKTOK_CLIENT_SECRET=...
```

### Opcionais (features):
```env
DEMO_MODE=true            # Habilita DemoSocialAdapter
SYNC_INTERVAL_MINUTES=1   # Default: 1
```

## 🎯 Comportamentos Críticos Implementados

### Auth
- ✅ Guard extrai Bearer JWT
- ✅ Verifica via SupabaseAuthAdapter
- ✅ **Role vem do DB (profiles.role), NUNCA de user_metadata**
- ✅ AdminGuard verifica role === admin

### Social OAuth
- ✅ POST/GET start: cria oauth_states com state + PKCE (TikTok)
- ✅ Callback: exchange code, profile, **UNIQUE (platform, platform_user_id)**
- ✅ Criptografia AES-256-GCM para tokens
- ✅ Se META_*/TIKTOK_* ausentes → **integration_unavailable com mensagem clara**
- ✅ DEMO_MODE=true → DemoSocialMetricsAdapter com dados fake

### Sync
- ✅ Após connect: enqueue sync job
- ✅ Scheduler a cada minuto: claim com SKIP LOCKED
- ✅ Full pagination com checkpoint
- ✅ Backoff exponencial + jitter em falha
- ✅ **NUNCA sobrescreve latest_views válido com null em falha de API**
- ✅ Grava snapshots de métricas
- ✅ Atualiza sync_coverage_ratio

### Rankings
- ✅ Para cada platform × category: compute ALL elegíveis
- ✅ Stale tolerance de settings (default 24h)
- ✅ Dentro da tolerância: mantém score com isStale; além: exclui
- ✅ Publica atomicamente via transação
- ✅ Top3/Top10 são slices da mesma versão publicada
- ✅ Posição pessoal computada do ranking completo

### HTTP API
- ✅ Todos os endpoints do contrato frontend/src/lib/api.ts
- ✅ Responses match exatamente (MeResponse, DashboardResponse.slices, etc.)
- ✅ Helmet, ValidationPipe, Throttler
- ✅ **Nunca retorna credentials/tokens em responses**

### Instagram Adapter
- ✅ OAuth: https://www.instagram.com/oauth/authorize + token exchange
- ✅ Scopes: instagram_business_basic,instagram_business_manage_insights
- ✅ List media, insights views lifetime
- ✅ Account insights quando disponível, senão availability unavailable
- ✅ **Documentado que app review é necessário**

### TikTok Adapter
- ✅ OAuth com PKCE: https://www.tiktok.com/v2/auth/authorize/
- ✅ Token: open.tiktokapis.com/v2/oauth/token/
- ✅ video.list com view_count
- ✅ Account official views = unavailable (limitação Display API)
- ✅ refreshCredentials implementado

## 📋 Gaps Conhecidos

### Dependências de Credenciais Externas

1. **Instagram Official API**
   - Requer META_APP_ID e META_APP_SECRET
   - **Requer app review da Meta para insights em produção**
   - Sem review: apenas test users podem conectar
   - Solução temporária: usar DEMO_MODE=true

2. **TikTok Official API**
   - Requer TIKTOK_CLIENT_KEY e TIKTOK_CLIENT_SECRET
   - Display API não fornece views totais da conta (apenas por vídeo)
   - Sem credenciais: OAuth start retorna erro claro

3. **MCP Integration**
   - MCP adapter sempre retorna integration_unavailable
   - Placeholder para futura integração

### Implementações Pendentes

1. **Manual Sync**
   - POST /api/social/accounts/:id/sync enfileira job mas não valida cooldown
   - Cooldown está em app_settings mas não é verificado

2. **Admin Syncs**
   - GET /api/admin/syncs retorna array vazio
   - POST /api/admin/syncs throws NotImplementedError

3. **Migrations Runner**
   - migrate.ts funciona mas documentado que Supabase SQL editor é preferido

## 🚀 Como Executar

```bash
# Instalar dependências
npm install

# Rodar migrações (ou usar Supabase SQL editor)
npm run migrate

# Seed demo (opcional, se DEMO_MODE=true)
npm run seed:demo

# Dev mode
npm run start:dev

# Build + Prod
npm run build
npm run start:prod

# Testes
npm test
npm run test:watch
```

## 📊 Estrutura Final

```
backend/src/
├── domain/
│   ├── entities.ts
│   ├── types.ts
│   ├── ranking-rules.ts (+ .spec.ts)
│   └── eligibility.ts (+ .spec.ts)
├── ports/
│   ├── repositories.port.ts
│   ├── auth.port.ts
│   ├── social-metrics.port.ts
│   ├── clock.port.ts
│   └── tokens.port.ts
├── adapters/
│   ├── auth/supabase-auth.adapter.ts
│   ├── crypto/aes-token-encryption.adapter.ts
│   ├── clock/system-clock.adapter.ts
│   ├── social/ (5 arquivos)
│   ├── persistence/pg/ (10 repositórios)
│   └── http/
│       ├── guards/ (2)
│       ├── dto/ (1)
│       └── controllers/ (7)
├── application/
│   ├── identity/ (2 use cases)
│   ├── dashboard/ (1 use case)
│   ├── social/ (2 use cases)
│   ├── sync/ (1 use case)
│   └── rankings/ (1 use case)
├── infrastructure/
│   ├── config/env.ts
│   ├── db/ (3 arquivos)
│   ├── scheduler/sync-scheduler.service.ts
│   └── tokens/injection-tokens.ts
├── main.ts
└── app.module.ts
```

**Total: ~60 arquivos TypeScript criados + 2 specs + config**
