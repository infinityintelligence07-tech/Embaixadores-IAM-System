# Arquitetura — Embaixadores Acorde Sua Mente

## Visão geral

Monólito modular com arquitetura hexagonal, uma unidade de implantação:

- **Backend:** NestJS (TypeScript) — API + servir frontend compilado
- **Frontend:** React + Vite + Tailwind
- **Dados/Auth:** PostgreSQL + Supabase Auth (projeto Supabase gerenciado)
- **Jobs:** tarefas persistidas em PostgreSQL, executadas pelo monólito
- **Deploy:** Docker Compose + Nginx na VPS Hostinger; DNS Cloudflare

```
┌─────────────┐     HTTPS      ┌─────────┐     ┌──────────────────────┐
│  Cloudflare │ ─────────────► │  Nginx  │ ──► │ NestJS (API+static)  │
└─────────────┘                └─────────┘     └──────────┬───────────┘
                                                          │
                                    ┌─────────────────────┼─────────────────────┐
                                    ▼                     ▼                     ▼
                              Supabase Auth         PostgreSQL            APIs IG/TT
```

## Camadas hexagonais

| Camada | Responsabilidade | Pode importar |
|---|---|---|
| `domain/` | Entidades, regras, value objects | Nada de framework/SDK |
| `application/` | Casos de uso | domain, ports |
| `ports/` | Interfaces (repos, auth, métricas, jobs) | domain |
| `adapters/` | HTTP, Supabase, PG, APIs sociais, MCP stub | ports, domain, SDKs |
| `infrastructure/` | Config, DB pool, logs, scheduler, crypto | adapters/ports |

## Módulos de negócio

1. **identity** — cadastro, sessão, perfil, papéis
2. **ambassadors** — membership, estados (pending/approved/suspended)
3. **social-accounts** — OAuth, unicidade por `platform_user_id`
4. **contents** — Reels/vídeos monitorados
5. **metrics** — snapshots acumulados (nunca somar snapshots)
6. **rankings** — versão atômica + entradas
7. **administration** — aprovação, auditoria, config, exclusões

## Publicação de rankings

1. Calcular classificação completa em memória/transação
2. Inserir `ranking_versions` com `status=computing`
3. Inserir todas as `ranking_entries`
4. Marcar versão anterior `superseded` e nova `published` na mesma transação
5. Leitura pública só de `published`

## Sincronização

- Jobs em `sync_jobs` / execuções em `sync_runs`
- Lock por conta (`FOR UPDATE SKIP LOCKED` / advisory lock)
- Checkpoint de paginação, backoff + jitter, cooldown manual
- Tolerância de desatualização padrão: 24h (configurável)
