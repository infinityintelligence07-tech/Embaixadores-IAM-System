import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createClient, isAuthRetryableFetchError, SupabaseClient } from '@supabase/supabase-js';
import { AuthPort, AuthUser } from '../../ports/auth.port';
import { AppRole, asProfileId } from '../../domain/types';
import { loadConfig } from '../../infrastructure/config/env';

const SESSION_EXPIRED = 'Sua sessão expirou. Entre de novo para continuar.';
const AUTH_UNAVAILABLE = 'Não conseguimos confirmar sua sessão agora. Tente de novo em instantes.';

/**
 * Token recusado vira 401 (o app encerra a sessão). Falha de rede ou do Supabase vira 503:
 * a sessão continua valendo e a pessoa só tenta de novo.
 */
export function sessionErrorToException(error: unknown): HttpException {
  if (isAuthRetryableFetchError(error)) return new ServiceUnavailableException(AUTH_UNAVAILABLE);
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && (status === 0 || status >= 500)) {
    return new ServiceUnavailableException(AUTH_UNAVAILABLE);
  }
  if (typeof status !== 'number' && error instanceof Error && !('__isAuthError' in error)) {
    return new ServiceUnavailableException(AUTH_UNAVAILABLE);
  }
  return new UnauthorizedException(SESSION_EXPIRED);
}

@Injectable()
export class SupabaseAuthAdapter implements AuthPort {
  private supabase: SupabaseClient;
  
  constructor() {
    const config = loadConfig();
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }
  
  async verifyAccessToken(token: string): Promise<AuthUser> {
    let result: Awaited<ReturnType<SupabaseClient['auth']['getUser']>>;
    try {
      result = await this.supabase.auth.getUser(token);
    } catch (error) {
      throw sessionErrorToException(error);
    }

    const { data, error } = result;
    if (error) throw sessionErrorToException(error);
    if (!data.user?.email) throw new UnauthorizedException(SESSION_EXPIRED);

    // CRITICAL: Role must come from database profile, NOT from user_metadata
    // The controller/guard will load the profile from database
    return {
      id: asProfileId(data.user.id),
      email: data.user.email,
      role: AppRole.Ambassador, // Default; will be overridden by database profile
    };
  }
}
