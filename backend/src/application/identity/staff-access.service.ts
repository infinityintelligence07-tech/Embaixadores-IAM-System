import { Injectable, OnModuleInit } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getPool } from '../../infrastructure/db/pool';
import { loadConfig } from '../../infrastructure/config/env';
import { AppRole } from '../../domain/types';

const STAFF_EMAILS = new Set([
  'mateuscarddosointencional@gmail.com',
  'contatotiagofiel@gmail.com',
  'nicoleintencional@gmail.com',
]);

@Injectable()
export class StaffAccessService implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    try {
      await this.ensureAccounts();
    } catch (error) {
      console.error(
        'staff_bootstrap_error',
        error instanceof Error ? error.message : error,
      );
    }
  }

  async apply(profile: { id: string; email: string; role: string }): Promise<AppRole> {
    if (!STAFF_EMAILS.has(profile.email.trim().toLowerCase())) {
      return profile.role as AppRole;
    }
    await this.grant(profile.id);
    return AppRole.Admin;
  }

  private async ensureAccounts(): Promise<void> {
    const config = loadConfig();
    const auth = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    for (const email of STAFF_EMAILS) {
      let userId = await lookupUserId(auth, email);
      if (!userId) {
        const created = await auth.auth.admin.createUser({
          email,
          password: `${crypto.randomUUID()}${crypto.randomUUID()}`,
          email_confirm: true,
          user_metadata: { full_name: 'Equipe IAM', public_name: 'Equipe IAM' },
        });
        userId = created.data.user?.id ?? null;
      }
      if (userId) await this.grant(userId);
    }
  }

  private async grant(profileId: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE profiles
       SET role = 'admin', onboarding_completed = true, updated_at = now()
       WHERE id = $1`,
      [profileId],
    );
    await pool.query(
      `UPDATE ambassador_memberships
       SET status = 'approved',
           approved_at = COALESCE(approved_at, now()),
           updated_at = now()
       WHERE profile_id = $1`,
      [profileId],
    );
  }
}

async function lookupUserId(
  auth: SupabaseClient,
  email: string,
): Promise<string | null> {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await auth.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) return null;
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found.id;
    if (data.users.length < 200) return null;
  }
  return null;
}
