import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getPool } from '../../infrastructure/db/pool';
import { loadConfig } from '../../infrastructure/config/env';
import { INJECTION_TOKENS } from '../../infrastructure/tokens/injection-tokens';
import { ClockPort } from '../../ports/clock.port';
import { MembershipRepository } from '../../ports/repositories.port';
import { ProfileId, SocialPlatform } from '../../domain/types';
import { AccountReviewService } from '../social/account-review.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SocialHandleUseCase } from '../social/social-handle.use-case';

const NETWORKS = new Set(['instagram', 'tiktok']);
// Domínio público das páginas; areaembaixadores.* só serve a API e redireciona as telas para cá.
const LOGIN_REDIRECT = 'https://embaixadores.iamcontrol.com.br/auth/callback';

const COLUMNS = `id, nome_completo, email, whatsapp, nome_conta, redes_sociais,
  instagram_handle, tiktok_handle, status, created_at, updated_at, reviewed_at, review_note,
  profile_id,
  (SELECT p.public_name FROM profiles p WHERE p.id = applications.reviewed_by) AS reviewed_by_name`;

export interface ApplicationRow {
  id: string;
  nome_completo: string;
  email: string;
  whatsapp: string;
  nome_conta: string;
  redes_sociais: string[];
  instagram_handle: string | null;
  tiktok_handle: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  review_note: string | null;
  profile_id: string | null;
}

export interface SubmitApplicationInput {
  nome_completo?: string;
  email?: string;
  whatsapp?: string;
  redes_sociais?: string[];
  instagram_handle?: string;
  tiktok_handle?: string;
  password?: string;
  ranking_consent?: boolean;
}

/** Aceita "@fulano", "fulano" ou a URL do perfil colada (instagram.com/fulano, tiktok.com/@fulano). */
export function normalizeHandle(value: string): string {
  const clean = value
    .trim()
    .replace(/^@+/, '')
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.|m\.)?(instagram|tiktok)\.com\//i, '')
    .split(/[/?#\s]/)[0]
    .replace(/^@+/, '');
  return clean ? `@${clean}` : '';
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

@Injectable()
export class ApplicationsService {
  private areaAuth: SupabaseClient | null = null;

  constructor(
    @Inject(INJECTION_TOKENS.CLOCK)
    private readonly clock: ClockPort,
    @Inject(INJECTION_TOKENS.MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: MembershipRepository,
    private readonly accountReview: AccountReviewService,
    private readonly notifications: NotificationsService,
    private readonly socialHandles: SocialHandleUseCase,
  ) {}

  private authClient(): SupabaseClient {
    if (!this.areaAuth) {
      const config = loadConfig();
      this.areaAuth = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return this.areaAuth;
  }

  /**
   * Cadastro pelo site: grava a candidatura e já cria a conta com a senha escolhida, sem
   * e-mail de confirmação. A pessoa entra na hora, conecta as redes e aguarda a equipe.
   */
  async submit(input: SubmitApplicationInput): Promise<{ id: string; accountCreated: true }> {
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

    const password = input.password ?? '';
    if (password.length < 8) {
      throw new BadRequestException('A senha precisa ter pelo menos 8 caracteres.');
    }
    if (password.length > 72) {
      throw new BadRequestException('A senha pode ter no máximo 72 caracteres.');
    }
    if (input.ranking_consent !== true) {
      throw new BadRequestException(
        'Para participar, autorize a divulgação do seu nome público no ranking.',
      );
    }

    const nomeConta = [
      redes.includes('instagram') ? `Instagram ${instagramHandle}` : '',
      redes.includes('tiktok') ? `TikTok ${tiktokHandle}` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    const taken = await getPool().query(
      `SELECT 1 FROM applications WHERE lower(email) = lower($1)
       UNION ALL
       SELECT 1 FROM profiles WHERE lower(email) = lower($1) AND deleted_at IS NULL
       LIMIT 1`,
      [email],
    );
    if (taken.rows[0]) {
      throw new ConflictException(
        'Já existe uma conta com este e-mail. Entre com a sua senha ou use "Esqueci minha senha".',
      );
    }

    const created = await this.authClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: nomeCompleto, public_name: nomeCompleto },
    });
    const userId = created.data.user?.id;
    if (!userId) {
      const message = (created.error?.message ?? '').toLowerCase();
      if (message.includes('already') || message.includes('registered')) {
        throw new ConflictException(
          'Já existe uma conta com este e-mail. Entre com a sua senha ou use "Esqueci minha senha".',
        );
      }
      if (message.includes('password')) {
        throw new BadRequestException(
          'Essa senha é fraca demais. Use letras e números, com pelo menos 8 caracteres.',
        );
      }
      console.error('signup_create_user_error', created.error?.message);
      throw new ServiceUnavailableException(
        'Não foi possível criar sua conta agora. Tente de novo em instantes.',
      );
    }

    let applicationId: string;
    try {
      // O gatilho do Supabase já criou o perfil e a participação "aguardando".
      await getPool().query(
        `UPDATE profiles SET onboarding_completed = true, updated_at = now() WHERE id = $1`,
        [userId],
      );
      const result = await getPool().query<{ id: string }>(
        `INSERT INTO applications (
           nome_completo, email, whatsapp, nome_conta, redes_sociais, instagram_handle,
           tiktok_handle, profile_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          nomeCompleto,
          email,
          whatsapp,
          nomeConta,
          redes,
          redes.includes('instagram') ? instagramHandle : null,
          redes.includes('tiktok') ? tiktokHandle : null,
          userId,
        ],
      );
      applicationId = result.rows[0].id;
    } catch (error) {
      await this.authClient().auth.admin.deleteUser(userId).catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Já existe uma conta com este e-mail. Entre com a sua senha ou use "Esqueci minha senha".',
        );
      }
      throw error;
    }

    await this.connectHandles(userId as ProfileId, [
      redes.includes('instagram') ? [SocialPlatform.Instagram, instagramHandle] : null,
      redes.includes('tiktok') ? [SocialPlatform.TikTok, tiktokHandle] : null,
    ]);
    return { id: applicationId, accountCreated: true };
  }

  /**
   * O @ do formulário já vira a rede conectada: a pessoa não digita de novo dentro do app.
   * Se o @ não for encontrado ou estiver privado, o cadastro segue e ela corrige em Conexões.
   */
  private async connectHandles(
    profileId: ProfileId,
    handles: ([SocialPlatform, string] | null)[],
  ): Promise<void> {
    for (const item of handles) {
      if (!item) continue;
      const [platform, handle] = item;
      if (!this.socialHandles.isEnabled(platform)) continue;
      try {
        await this.socialHandles.claim(profileId, platform, handle);
      } catch (error) {
        console.warn(
          'signup_connect_handle_skipped',
          platform,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  async list(): Promise<ApplicationRow[]> {
    const result = await getPool().query<ApplicationRow>(
      `SELECT ${COLUMNS} FROM applications ORDER BY created_at DESC`,
    );
    return result.rows.map(serialize);
  }

  async updateStatus(
    id: string,
    status: ApplicationRow['status'],
    actorId: string,
    rawNote?: string,
  ): Promise<ApplicationRow> {
    const current = await this.findById(id);
    const note = rawNote?.trim() || null;
    const profileId = current.profile_id ?? (await this.profileIdByEmail(current.email));

    if (status === 'rejected' && profileId && (!note || note.length < 3)) {
      throw new BadRequestException('Escreva o motivo. A pessoa recebe esse recado no app.');
    }

    if (status === 'approved') {
      if (profileId) {
        await this.membershipRepo.approve(
          profileId as ProfileId,
          actorId as ProfileId,
          this.clock.now(),
        );
        const approved = await this.accountReview.approveAllFor(
          profileId as ProfileId,
          actorId as ProfileId,
        );
        if (approved === 0) {
          await this.notifications.notify(
            profileId,
            'application_approved',
            'Seu cadastro foi aprovado',
            'Conecte o seu Instagram ou TikTok. A equipe confere a conta e ela entra no ranking.',
          );
        }
      } else {
        await this.provisionAccess(current, actorId);
      }
    }

    if (status === 'rejected' && profileId && note) {
      await this.accountReview.rejectAllFor(profileId as ProfileId, note, actorId as ProfileId);
    }

    const updated = await getPool().query<{ id: string }>(
      `UPDATE applications
       SET status = $2,
           updated_at = now(),
           reviewed_at = CASE WHEN $2 = 'pending' THEN NULL ELSE now() END,
           reviewed_by = CASE WHEN $2 = 'pending' THEN NULL ELSE $3::uuid END,
           review_note = $4,
           profile_id = COALESCE(profile_id, $5::uuid)
       WHERE id = $1
       RETURNING id`,
      [id, status, actorId, status === 'rejected' ? note : null, profileId],
    );
    if (!updated.rows[0]) throw new NotFoundException('Candidatura não encontrada');

    if (status !== 'pending') {
      await getPool().query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'application', $3, $4)`,
        [
          actorId,
          status === 'approved' ? 'approve_application' : 'reject_application',
          id,
          JSON.stringify({ name: current.nome_completo, email: current.email }),
        ],
      );
    }

    return this.findById(id).then(serialize);
  }

  /** O @ que a pessoa informou no formulário para essa rede, para já vir preenchido na conexão. */
  async handleFor(email: string, platform: 'instagram' | 'tiktok'): Promise<string | null> {
    const column = platform === 'instagram' ? 'instagram_handle' : 'tiktok_handle';
    const result = await getPool().query<{ handle: string }>(
      `SELECT ${column} AS handle FROM applications
       WHERE lower(email) = lower($1) AND ${column} IS NOT NULL AND ${column} <> ''
       ORDER BY created_at DESC
       LIMIT 1`,
      [email.trim()],
    );
    const handle = result.rows[0]?.handle;
    return handle ? normalizeHandle(handle) || null : null;
  }

  async remove(id: string): Promise<void> {
    const result = await getPool().query(`DELETE FROM applications WHERE id = $1`, [id]);
    if (result.rowCount === 0) throw new NotFoundException('Candidatura não encontrada');
  }

  private async profileIdByEmail(email: string): Promise<string | null> {
    const result = await getPool().query<{ id: string }>(
      `SELECT id FROM profiles WHERE lower(email) = lower($1) AND deleted_at IS NULL LIMIT 1`,
      [email.trim()],
    );
    return result.rows[0]?.id ?? null;
  }

  private async findById(id: string): Promise<ApplicationRow> {
    const result = await getPool().query<ApplicationRow>(
      `SELECT ${COLUMNS} FROM applications WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Candidatura não encontrada');
    return row;
  }

  private async provisionAccess(application: ApplicationRow, actorId: string): Promise<void> {
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
        approved_by: actorId,
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
    reviewed_at: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
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
