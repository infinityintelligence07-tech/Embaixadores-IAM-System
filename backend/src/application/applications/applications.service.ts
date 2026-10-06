import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getPool } from '../../infrastructure/db/pool';
import { loadConfig } from '../../infrastructure/config/env';

const NETWORKS = new Set(['instagram', 'tiktok']);
const LOGIN_REDIRECT = 'https://embaixadores.iamcontrol.com.br/auth/callback';

export interface ApplicationRow {
  id: string;
  nome_completo: string;
  email: string;
  whatsapp: string;
  nome_conta: string;
  redes_sociais: string[];
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface SubmitApplicationInput {
  nome_completo?: string;
  email?: string;
  whatsapp?: string;
  redes_sociais?: string[];
  instagram_handle?: string;
  tiktok_handle?: string;
}

function normalizeHandle(value: string): string {
  const clean = value.trim().replace(/^@+/, '');
  return clean ? `@${clean}` : '';
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

@Injectable()
export class ApplicationsService {
  private areaAuth: SupabaseClient | null = null;

  private authClient(): SupabaseClient {
    if (!this.areaAuth) {
      const config = loadConfig();
      this.areaAuth = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return this.areaAuth;
  }

  async submit(input: SubmitApplicationInput): Promise<{ id: string }> {
    const nomeCompleto = input.nome_completo?.trim() ?? '';
    const email = input.email?.trim().toLowerCase() ?? '';
    const whatsapp = normalizePhone(input.whatsapp ?? '');
    const redes = [
      ...new Set(
        (input.redes_sociais ?? [])
          .map((item) => item.trim().toLowerCase())
          .filter((item) => NETWORKS.has(item)),
      ),
    ];
    const instagramHandle = normalizeHandle(input.instagram_handle ?? '');
    const tiktokHandle = normalizeHandle(input.tiktok_handle ?? '');

    if (nomeCompleto.length < 2) throw new BadRequestException('Informe o nome completo');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Informe um e-mail válido');
    }
    if (whatsapp.length < 10) throw new BadRequestException('Informe um WhatsApp válido');
    if (redes.length === 0) {
      throw new BadRequestException('Selecione Instagram, TikTok ou os dois');
    }
    if (redes.includes('instagram') && !instagramHandle) {
      throw new BadRequestException('Informe o @ do Instagram');
    }
    if (redes.includes('tiktok') && !tiktokHandle) {
      throw new BadRequestException('Informe o @ do TikTok');
    }

    const nomeConta = [
      redes.includes('instagram') ? `Instagram ${instagramHandle}` : '',
      redes.includes('tiktok') ? `TikTok ${tiktokHandle}` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    try {
      const result = await getPool().query<{ id: string }>(
        `INSERT INTO applications (nome_completo, email, whatsapp, nome_conta, redes_sociais)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [nomeCompleto, email, whatsapp, nomeConta, redes],
      );
      return { id: result.rows[0].id };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Este e-mail já foi cadastrado');
      }
      throw error;
    }
  }

  async list(): Promise<ApplicationRow[]> {
    const result = await getPool().query<ApplicationRow>(
      `SELECT id, nome_completo, email, whatsapp, nome_conta, redes_sociais, status,
              created_at, updated_at
       FROM applications
       ORDER BY created_at DESC`,
    );
    return result.rows.map(serialize);
  }

  async updateStatus(
    id: string,
    status: ApplicationRow['status'],
  ): Promise<ApplicationRow> {
    if (status === 'approved') {
      const current = await this.findById(id);
      await this.provisionAccess(current);
    }

    const result = await getPool().query<ApplicationRow>(
      `UPDATE applications
       SET status = $2, updated_at = now()
       WHERE id = $1
       RETURNING id, nome_completo, email, whatsapp, nome_conta, redes_sociais, status,
                 created_at, updated_at`,
      [id, status],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Candidatura não encontrada');
    return serialize(row);
  }

  async remove(id: string): Promise<void> {
    const result = await getPool().query(`DELETE FROM applications WHERE id = $1`, [id]);
    if (result.rowCount === 0) throw new NotFoundException('Candidatura não encontrada');
  }

  private async findById(id: string): Promise<ApplicationRow> {
    const result = await getPool().query<ApplicationRow>(
      `SELECT id, nome_completo, email, whatsapp, nome_conta, redes_sociais, status,
              created_at, updated_at
       FROM applications
       WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Candidatura não encontrada');
    return row;
  }

  private async provisionAccess(application: ApplicationRow): Promise<void> {
    const auth = this.authClient();
    const email = application.email.trim().toLowerCase();
    const name = application.nome_completo.trim();
    const metadata = { full_name: name, public_name: name };

    const invited = await auth.auth.admin.inviteUserByEmail(email, {
      data: metadata,
      redirectTo: LOGIN_REDIRECT,
    });

    let userId = invited.data.user?.id ?? null;
    if (!userId) userId = await findUserId(auth, email);
    if (!userId) {
      const created = await auth.auth.admin.createUser({
        email,
        password: `${crypto.randomUUID()}${crypto.randomUUID()}`,
        email_confirm: true,
        user_metadata: metadata,
      });
      userId = created.data.user?.id ?? null;
      if (!userId) {
        throw new BadRequestException('Não foi possível criar o acesso na área');
      }
    }

    const membership = await auth.from('ambassador_memberships').upsert(
      {
        profile_id: userId,
        status: 'approved',
        approved_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id' },
    );
    if (membership.error) {
      throw new BadRequestException('Não foi possível liberar o acesso na área');
    }

    await auth.from('profiles').update({ full_name: name, public_name: name }).eq('id', userId);
  }
}

function serialize(row: ApplicationRow): ApplicationRow {
  return {
    ...row,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
    redes_sociais: row.redes_sociais ?? [],
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

async function findUserId(auth: SupabaseClient, email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await auth.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) return null;
    const found = data.users.find((user) => user.email?.toLowerCase() === target);
    if (found) return found.id;
    if (data.users.length < 200) return null;
  }
  return null;
}
