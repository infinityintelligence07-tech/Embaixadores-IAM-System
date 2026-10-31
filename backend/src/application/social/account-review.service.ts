import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { getPool } from '../../infrastructure/db/pool';
import { INJECTION_TOKENS } from '../../infrastructure/tokens/injection-tokens';
import { ClockPort } from '../../ports/clock.port';
import { AuditRepository, SocialAccountRepository } from '../../ports/repositories.port';
import { AccountReviewStatus, ProfileId, SocialAccountId, SocialPlatform } from '../../domain/types';
import { SocialAccount } from '../../domain/entities';
import { NotificationsService } from '../notifications/notifications.service';
import { networkName } from '../../domain/social-handle';
import { rankedMediaSql } from '../../domain/ranked-media';

export type ReviewDecision =
  | AccountReviewStatus.Approved
  | AccountReviewStatus.ChangesRequested
  | AccountReviewStatus.Rejected;

const DECISIONS = new Set<string>([
  AccountReviewStatus.Approved,
  AccountReviewStatus.ChangesRequested,
  AccountReviewStatus.Rejected,
]);

export interface AccountReviewItem {
  accountId: string;
  platform: SocialPlatform;
  username: string | null;
  profileUrl: string | null;
  connectionStatus: string;
  verifiedAt: string | null;
  reviewStatus: AccountReviewStatus;
  reviewNote: string | null;
  connectedAt: string;
  profileId: string;
  fullName: string;
  publicName: string;
  email: string;
  whatsapp: string | null;
  membershipStatus: string | null;
}

/** Linha da tela de contas da equipe: toda conta ativa, com a pessoa dona dela. */
export interface AdminAccountItem {
  accountId: string;
  platform: SocialPlatform;
  username: string | null;
  profileUrl: string | null;
  reviewStatus: AccountReviewStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  connectedAt: string;
  lastSyncAt: string | null;
  views: number;
  profileId: string;
  fullName: string;
  publicName: string;
  email: string;
  whatsapp: string | null;
  membershipStatus: 'pending' | 'approved' | 'suspended' | null;
}

const iso = (value: unknown): string | null =>
  value ? new Date(value as string).toISOString() : null;

@Injectable()
export class AccountReviewService {
  constructor(
    @Inject(INJECTION_TOKENS.CLOCK)
    private readonly clock: ClockPort,
    @Inject(INJECTION_TOKENS.SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccountRepo: SocialAccountRepository,
    @Inject(INJECTION_TOKENS.AUDIT_REPOSITORY)
    private readonly auditRepo: AuditRepository,
    private readonly notifications: NotificationsService,
  ) {}

  parseDecision(value: unknown): ReviewDecision {
    if (typeof value !== 'string' || !DECISIONS.has(value)) {
      throw new BadRequestException('Escolha aprovar, pedir ajuste ou reprovar.');
    }
    return value as ReviewDecision;
  }

  /** Contas esperando a equipe e contas esperando o ajuste do embaixador. */
  async listOpen(): Promise<AccountReviewItem[]> {
    const result = await getPool().query(
      `SELECT sa.id, sa.platform, sa.username, sa.profile_url, sa.status, sa.verified_at,
              sa.review_status, sa.review_note, sa.created_at,
              p.id AS profile_id, p.full_name, p.public_name, p.email,
              m.status AS membership_status,
              (SELECT a.whatsapp FROM applications a
                WHERE a.profile_id = p.id OR lower(a.email) = lower(p.email)
                ORDER BY a.created_at DESC LIMIT 1) AS whatsapp
       FROM social_accounts sa
       JOIN profiles p ON p.id = sa.profile_id AND p.deleted_at IS NULL
       LEFT JOIN ambassador_memberships m ON m.profile_id = p.id
       WHERE sa.disconnected_at IS NULL
         AND sa.review_status IN ('pending', 'changes_requested')
         AND COALESCE(m.status::text, 'pending') <> 'suspended'
       ORDER BY (sa.review_status = 'pending') DESC, sa.updated_at ASC`,
    );
    return result.rows.map((row) => ({
      accountId: row.id,
      platform: row.platform,
      username: row.username,
      profileUrl: row.profile_url,
      connectionStatus: row.status,
      verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
      reviewStatus: row.review_status,
      reviewNote: row.review_note,
      connectedAt: new Date(row.created_at).toISOString(),
      profileId: row.profile_id,
      fullName: row.full_name,
      publicName: row.public_name,
      email: row.email,
      whatsapp: row.whatsapp ?? null,
      membershipStatus: row.membership_status ?? null,
    }));
  }

  /** Todas as contas ativas de quem não é da equipe. As que esperam a equipe vêm primeiro. */
  async listAll(): Promise<AdminAccountItem[]> {
    const result = await getPool().query(
      `SELECT sa.id, sa.platform, sa.username, sa.profile_url, sa.review_status, sa.review_note,
              sa.reviewed_at, sa.created_at, sa.last_synced_at,
              reviewer.public_name AS reviewed_by_name,
              p.id AS profile_id, p.full_name, p.public_name, p.email,
              m.status AS membership_status,
              (SELECT a.whatsapp FROM applications a
                WHERE a.profile_id = p.id OR lower(a.email) = lower(p.email)
                ORDER BY a.created_at DESC LIMIT 1) AS whatsapp,
              (SELECT COALESCE(SUM(c.latest_views), 0) FROM contents c
                WHERE c.social_account_id = sa.id
                  AND c.eligible = true
                  AND c.excluded_at IS NULL
                  AND c.removed_on_platform = false
                  AND ${rankedMediaSql('c')}) AS views
       FROM social_accounts sa
       JOIN profiles p ON p.id = sa.profile_id AND p.deleted_at IS NULL AND p.role <> 'admin'
       LEFT JOIN ambassador_memberships m ON m.profile_id = p.id
       LEFT JOIN profiles reviewer ON reviewer.id = sa.reviewed_by
       WHERE sa.disconnected_at IS NULL
       ORDER BY CASE sa.review_status
                  WHEN 'pending' THEN 0
                  WHEN 'changes_requested' THEN 1
                  WHEN 'approved' THEN 2
                  ELSE 3
                END,
                sa.created_at DESC`,
    );
    return result.rows.map((row) => ({
      accountId: row.id,
      platform: row.platform,
      username: row.username,
      profileUrl: row.profile_url,
      reviewStatus: row.review_status,
      reviewNote: row.review_note,
      reviewedAt: iso(row.reviewed_at),
      reviewedByName: row.reviewed_by_name ?? null,
      connectedAt: new Date(row.created_at).toISOString(),
      lastSyncAt: iso(row.last_synced_at),
      views: Number(row.views) || 0,
      profileId: row.profile_id,
      fullName: row.full_name,
      publicName: row.public_name,
      email: row.email,
      whatsapp: row.whatsapp ?? null,
      membershipStatus: row.membership_status ?? null,
    }));
  }

  async review(
    accountId: string,
    decision: ReviewDecision,
    rawNote: unknown,
    actorId: ProfileId,
  ): Promise<SocialAccount> {
    const note = typeof rawNote === 'string' ? rawNote.trim().slice(0, 500) : '';
    if (decision !== AccountReviewStatus.Approved && note.length < 3) {
      throw new BadRequestException('Escreva o que a pessoa precisa saber ou ajustar.');
    }
    const account = await this.socialAccountRepo.findById(accountId as SocialAccountId);
    if (!account) throw new NotFoundException('Conta não encontrada.');

    const updated = await this.applyDecision(account, decision, note || null, actorId);
    await this.auditRepo.append({
      actorId,
      action: `review_account_${decision}`,
      entityType: 'social_account',
      entityId: account.id,
      reason: note || undefined,
      metadata: { platform: account.platform, username: account.username },
    });
    return updated;
  }

  /**
   * Aprovar de novo uma candidatura reprovada volta as contas reprovadas junto com ela (mesmo
   * recado). Contas reprovadas pela equipe por outro motivo continuam reprovadas.
   */
  async restoreRejectedWithApplication(
    profileId: ProfileId,
    applicationNote: string,
    actorId: ProfileId,
  ): Promise<number> {
    let restored = 0;
    for (const account of await this.socialAccountRepo.findActiveByProfile(profileId)) {
      if (
        account.reviewStatus === AccountReviewStatus.Rejected &&
        account.reviewNote === applicationNote
      ) {
        await this.applyDecision(account, AccountReviewStatus.Approved, null, actorId);
        restored += 1;
      }
    }
    return restored;
  }

  /** Reprovar a candidatura fecha as contas conectadas e avisa a pessoa uma vez. */
  async rejectAllFor(profileId: ProfileId, note: string, actorId: ProfileId): Promise<void> {
    for (const account of await this.socialAccountRepo.findActiveByProfile(profileId)) {
      if (account.reviewStatus !== AccountReviewStatus.Rejected) {
        await this.socialAccountRepo.update(account.id, {
          reviewStatus: AccountReviewStatus.Rejected,
          reviewNote: note,
          reviewedAt: this.clock.now(),
          reviewedBy: actorId,
        });
      }
    }
    await this.notifications.notify(
      profileId,
      'application_rejected',
      'Sua candidatura não foi aprovada',
      note,
    );
  }

  /** O embaixador avisa que fez o ajuste pedido; a conta volta para a fila da equipe. */
  async requestNewReview(profileId: ProfileId, accountId: string): Promise<SocialAccount> {
    const account = await this.socialAccountRepo.findById(accountId as SocialAccountId);
    // Conta de outra pessoa responde como inexistente, igual a desconectar e sincronizar.
    if (!account || account.profileId !== profileId) {
      throw new NotFoundException('Conta não encontrada.');
    }
    if (account.reviewStatus !== AccountReviewStatus.ChangesRequested) {
      throw new BadRequestException('Essa conta não tem ajuste pendente.');
    }
    const updated = await this.socialAccountRepo.update(account.id, {
      reviewStatus: AccountReviewStatus.Pending,
    });
    await this.auditRepo.append({
      actorId: profileId,
      action: 'request_account_review',
      entityType: 'social_account',
      entityId: account.id,
      metadata: { platform: account.platform, username: account.username },
    });
    return updated;
  }

  private async applyDecision(
    account: SocialAccount,
    decision: ReviewDecision,
    note: string | null,
    actorId: ProfileId,
  ): Promise<SocialAccount> {
    const now = this.clock.now();
    const updated = await this.socialAccountRepo.update(account.id, {
      reviewStatus: decision,
      reviewNote: note,
      reviewedAt: now,
      reviewedBy: actorId,
    });

    const name = networkName(account.platform);
    const handle = account.username ? `@${account.username.replace(/^@/, '')}` : `Seu ${name}`;

    // Aprovar a conta não mexe na participação: ela nasce aprovada no cadastro e a
    // suspensão é decidida em Pessoas.
    if (decision === AccountReviewStatus.Approved) {
      await this.notifications.notify(
        account.profileId,
        'account_approved',
        `Seu ${name} foi aprovado`,
        `${handle} entrou na competição. As views dos seus vídeos passam a contar no ranking na próxima atualização, em até 10 minutos.`,
      );
    } else if (decision === AccountReviewStatus.ChangesRequested) {
      await this.notifications.notify(
        account.profileId,
        'account_changes_requested',
        `Ajuste pedido no seu ${name}`,
        `${note} Depois de ajustar, toque em "Já ajustei" na tela de conexões para a equipe olhar de novo.`,
      );
    } else {
      await this.notifications.notify(
        account.profileId,
        'account_rejected',
        `Seu ${name} não entrou na competição`,
        note ?? '',
      );
    }
    return updated;
  }
}
