# Guia — Cadastro do app TikTok (Embaixadores)

Use isto no formulário do TikTok for Developers. Prefira **Sandbox** para testar antes de **Submit for review** em Production.

## Correção importante

| Campo | Valor CORRETO | NÃO use |
|---|---|---|
| Web/Desktop URL | `https://embaixadores.iamcontrol.com.br` | URL de callback OAuth |
| Redirect / Callback (Login Kit) | `https://embaixadores.iamcontrol.com.br/api/social/oauth/tiktok/callback` | — |

A URL de callback **não** é o “site oficial”. Ela fica na configuração do **Login Kit**.

## Campos básicos (Production / Sandbox)

| Campo | Valor sugerido |
|---|---|
| App name | `Embaixadores Acorde Sua Mente` (ou `embaixadores` se limite curto) |
| Category | `Business` |
| Description (EN, ≤120) | `Ambassador ranking platform that syncs authorized TikTok video view metrics.` |
| Description (alt) | `Ranks ambassadors by authorized TikTok video views via Display API.` |
| Terms of Service URL | `https://embaixadores.iamcontrol.com.br/termos` |
| Privacy Policy URL | `https://embaixadores.iamcontrol.com.br/privacidade` |
| Platforms | marque só **Web** |
| Web/Desktop URL | `https://embaixadores.iamcontrol.com.br` |
| App icon | `docs/assets/tiktok-app-icon.png` (1024×1024) |

## Products e Scopes (obrigatório)

1. **+ Add products** → adicione:
   - **Login Kit**
   - **TikTok API** (Display API / para listar vídeos)
2. **+ Add scopes** → apenas o que o app usa:
   - `user.info.basic`
   - `video.list`

Não adicione Share Kit, Content Posting etc. — atrasa a revisão.

### Login Kit — Redirect URI

```
https://embaixadores.iamcontrol.com.br/api/social/oauth/tiktok/callback
```

Em Sandbox/local, se permitido:

```
http://localhost:3000/api/social/oauth/tiktok/callback
```

## App review — texto (colar no campo Explanation)

```
Our web app "Embaixadores Acorde Sua Mente" (https://embaixadores.iamcontrol.com.br) lets approved brand ambassadors connect their own TikTok account via Login Kit (OAuth + PKCE).

Scopes used:
- user.info.basic: read the authorized user's open_id, avatar, and display name to prove account ownership and show the connected profile.
- video.list: list the user's public videos and read view_count to sync monitored video metrics.

Flow shown in the demo:
1) User signs in to our website.
2) Opens Connections and clicks "Connect TikTok".
3) Completes TikTok authorization (Login Kit).
4) Our backend stores encrypted tokens and syncs videos/metrics via Display API (/v2/user/info/, /v2/video/list/).
5) Metrics appear on the dashboard and rankings (TikTok category only; we do not post or share content).

We do not use Share Kit or Content Posting API. Users can disconnect TikTok anytime. Privacy Policy and Terms are published on our domain.
```

## Demo video (Production review)

Grave um MP4 (≤50MB) no **Sandbox**, mostrando:

1. Abrir `https://embaixadores.iamcontrol.com.br` (domínio deve bater com o Web URL)
2. Login → Conexões → Conectar TikTok
3. Tela de autorização TikTok
4. Retorno à plataforma com conta conectada
5. Lista de vídeos / métricas / ranking TikTok

Se o site ainda não estiver no ar, publique primeiro (VPS) ou use Sandbox sem submit de Production.

## Depois de salvar

1. Em **Basic information** / **Credentials**, copie **Client Key** e **Client Secret**
2. Cole no `.env`:

```env
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
```

3. Quando a integração real estiver aprovada: `DEMO_MODE=false`
