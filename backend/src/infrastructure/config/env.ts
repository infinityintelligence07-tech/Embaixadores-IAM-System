import { config } from 'dotenv';

config();

export interface AppConfig {
  database: {
    url: string;
  };
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
    jwtSecret: string;
  };
  auth: {
    jwtSecret: string;
  };
  encryption: {
    tokenKey: string;
  };
  app: {
    baseUrl: string;
    port: number;
    corsOrigin: string;
  };
  social: {
    meta: {
      appId: string | null;
      appSecret: string | null;
    };
    tiktok: {
      clientKey: string | null;
      clientSecret: string | null;
    };
  };
  demo: {
    enabled: boolean;
  };
  sync: {
    intervalMinutes: number;
  };
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export function loadConfig(): AppConfig {
  return {
    database: {
      url: requireEnv('DATABASE_URL'),
    },
    supabase: {
      url: requireEnv('SUPABASE_URL'),
      anonKey: requireEnv('SUPABASE_ANON_KEY'),
      serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      jwtSecret: process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET || '',
    },
    auth: {
      jwtSecret: process.env.SUPABASE_JWT_SECRET || requireEnv('JWT_SECRET'),
    },
    encryption: {
      tokenKey: requireEnv('TOKEN_ENCRYPTION_KEY'),
    },
    app: {
      baseUrl: requireEnv('APP_BASE_URL'),
      port: parseInt(optionalEnv('PORT', '3000'), 10),
      corsOrigin: optionalEnv('CORS_ORIGIN', '*'),
    },
    social: {
      meta: {
        appId: process.env.META_APP_ID || null,
        appSecret: process.env.META_APP_SECRET || null,
      },
      tiktok: {
        clientKey: process.env.TIKTOK_CLIENT_KEY || null,
        clientSecret: process.env.TIKTOK_CLIENT_SECRET || null,
      },
    },
    demo: {
      enabled: process.env.DEMO_MODE === 'true',
    },
    sync: {
      intervalMinutes: parseInt(
        optionalEnv('SYNC_INTERVAL_MINUTES', '1'),
        10,
      ),
    },
  };
}
