# Implantação — VPS Hostinger + Cloudflare + Supabase

## Componentes

| Componente | Onde roda |
|---|---|
| NestJS (API + frontend estático) | VPS Hostinger (Docker) |
| Nginx (proxy HTTPS) | VPS Hostinger |
| PostgreSQL + Auth | Supabase gerenciado (fora da VPS) |
| DNS | Cloudflare |

**Não inventamos IPs nem App IDs.** Use o IP público da sua VPS e os IDs reais dos apps Meta/TikTok/Supabase.

## 1. DNS (Cloudflare)

No painel Cloudflare do domínio `iamcontrol.com.br`:

| Tipo | Nome | Conteúdo | Proxy |
|---|---|---|---|
| A | `embaixadores` | `<IP_PUBLICO_DA_VPS>` | Proxied (laranja) |

SSL/TLS → **Full (Strict)** após o certificado na origem (Let's Encrypt via Nginx ou Traefik).

### Cache Cloudflare

Bypass / Cache Level Bypass para:

- `/api/*`
- `/auth/*`
- callbacks OAuth
- respostas autenticadas (cookies/Authorization)

Recomendação: Page Rule ou Cache Rules excluindo esses paths.

## 2. Firewall VPS

Portas públicas:

- `80/tcp` (HTTP → redirect HTTPS)
- `443/tcp` (HTTPS)

Fechar Postgres, Redis e portas internas do app. O app Docker escuta só na rede interna; Nginx faz proxy.

## 3. Variáveis

Copie `.env.example` → `.env` na VPS e preencha. Nunca commite segredos.

## 4. Build e start

```bash
# Na VPS, no diretório do projeto
cp .env.example .env
# edite .env

docker compose build
docker compose up -d

# Migrations (contra Supabase)
docker compose exec app node dist/infrastructure/db/migrate.js
# ou: npm run migrate com DATABASE_URL do Supabase
```

Aplicar também o SQL em `supabase/migrations/` via Supabase CLI ou SQL Editor (inclui RLS).

## 5. HTTPS origem

Com o `docker/nginx/nginx.conf` e Certbot (ou certificado Hostinger):

```bash
certbot --nginx -d embaixadores.iamcontrol.com.br
```

Cloudflare Full (Strict) exige certificado válido na origem.

## 6. Health check

- Container: `GET /api/health`
- Compose: `restart: unless-stopped` + healthcheck

## 7. Atualização

```bash
git pull
docker compose build app
docker compose up -d app
# migrations se houver
docker compose exec app node dist/infrastructure/db/migrate.js
```

## 8. Rollback

```bash
git checkout <commit-anterior>
docker compose build app
docker compose up -d app
# se migration for irreversível, restore de backup antes
```

## 9. Backup / restore

- **Banco:** backups automáticos do Supabase + `pg_dump` periódico se desejar cópia extra
- **Segredos:** backup offline de `TOKEN_ENCRYPTION_KEY` e `.env` (sem versionar)
- Restore: restore do dump Supabase / Point-in-Time Recovery do plano

## 10. Logs

Docker logging driver `json-file` com `max-size` / `max-file` (ver `docker-compose.yml`).

## URLs de produção a registrar

- Site: `https://embaixadores.iamcontrol.com.br`
- API health: `https://embaixadores.iamcontrol.com.br/api/health`
- Auth callback: `https://embaixadores.iamcontrol.com.br/auth/callback`
- Reset senha: `https://embaixadores.iamcontrol.com.br/auth/reset`
- IG OAuth: `https://embaixadores.iamcontrol.com.br/api/social/oauth/instagram/callback`
- TT OAuth: `https://embaixadores.iamcontrol.com.br/api/social/oauth/tiktok/callback`
