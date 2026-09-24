import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuthPort, AuthUser } from '../../ports/auth.port';
import { AppRole, asProfileId } from '../../domain/types';
import { loadConfig } from '../../infrastructure/config/env';

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
    try {
      const { data, error } = await this.supabase.auth.getUser(token);
      
      if (error || !data.user) {
        throw new UnauthorizedException('Invalid or expired token');
      }
      
      // CRITICAL: Role must come from database profile, NOT from user_metadata
      // The controller/guard will load the profile from database
      return {
        id: asProfileId(data.user.id),
        email: data.user.email!,
        role: AppRole.Ambassador, // Default; will be overridden by database profile
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token verification failed');
    }
  }
}
