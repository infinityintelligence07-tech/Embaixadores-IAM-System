# Diagrama do modelo de dados

```mermaid
erDiagram
  profiles ||--|| ambassador_memberships : has
  profiles ||--o{ social_accounts : owns
  social_accounts ||--|| social_credentials : has
  social_accounts ||--o{ contents : publishes
  contents ||--o{ content_metric_snapshots : snapshots
  social_accounts ||--o{ account_metric_snapshots : snapshots
  social_accounts ||--o{ sync_jobs : queued
  sync_jobs ||--o{ sync_runs : executes
  ranking_versions ||--o{ ranking_entries : contains
  profiles ||--o{ ranking_entries : appears
  profiles ||--o{ audit_logs : actor

  profiles {
    uuid id PK
    text email
    text full_name
    text public_name
    text avatar_url
    app_role role
    timestamptz deleted_at
  }

  ambassador_memberships {
    uuid id PK
    uuid profile_id FK
    membership_status status
    timestamptz approved_at
  }

  social_accounts {
    uuid id PK
    uuid profile_id FK
    social_platform platform
    text platform_user_id
    connection_status status
    text transport
  }

  social_credentials {
    uuid id PK
    uuid social_account_id FK
    text access_token_ciphertext
    text refresh_token_ciphertext
  }

  contents {
    uuid id PK
    uuid social_account_id FK
    text platform_content_id
    bigint latest_views
    boolean eligible
  }

  ranking_versions {
    uuid id PK
    social_platform platform
    ranking_category category
    ranking_version_status status
  }

  ranking_entries {
    uuid id PK
    uuid ranking_version_id FK
    int position
    uuid profile_id FK
    bigint score
  }
```

## Regras importantes

- `UNIQUE (platform, platform_user_id)` em `social_accounts` impede a mesma conta social em dois embaixadores.
- `UNIQUE (profile_id, platform)` limita a uma conta Instagram e uma TikTok por pessoa no MVP.
- Contadores em `BIGINT`.
- Snapshots acumulados: nunca somar snapshots sucessivos do mesmo contador.
- Credenciais só no servidor; RLS nega acesso via PostgREST a `social_credentials`.
- Papel admin em `profiles.role`, não em `user_metadata`.

## Consentimento e retenção

Ver `docs/SECURITY_PRIVACY.md`.
