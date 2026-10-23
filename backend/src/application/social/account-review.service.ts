import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { getPool } from '../../infrastructure/db/pool';
import { INJECTION_TOKENS } from '../../infrastructure/tokens/injection-tokens';
import { ClockPort } from '../../ports/clock.port';
import {
  AuditRepository,
  MembershipRepository,
  SocialAccountRepository,
} from '../../ports/repositories.port';
import { AccountReviewStatus, ProfileId, SocialAccountId, SocialPlatform } from '../../domain/types';
import { SocialAccount } from '../../domain/entities';
import { NotificationsService } from '../notifications/notifications.service';

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

function networkName(platform: SocialPlatform): string {
  return platform === SocialPlatform.Instagram ? 'Instagram' : 'TikTok';
}

@Injectable()
export class AccountReviewService {
  constructor(
    @Inject(INJECTION_TOKENS.CLOCK)
    private readonly clock: ClockPort,
    @Inject(INJECTION_TOKENS.SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccountRepo: SocialAccountRepository,
    @Inject(INJECTION_TOKENS.MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: MembershipRepository,
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

  /** Aprovar a pessoa aprova junto as contas que ela já conectou e ainda não foram analisadas. */
  async approveAllFor(profileId: ProfileId, actorId: ProfileId): Promise<number> {
    let approved = 0;
    for (const platform of [SocialPlatform.Instagram, SocialPlatform.TikTok]) {
      const account = await this.socialAccountRepo.findByProfileAndPlatform(profileId, platform);
      if (account && account.reviewStatus === AccountReviewStatus.Pending) {
        await this.applyDecision(account, AccountReviewStatus.Approved, null, actorId);
        approved += 1;
      }
    }
    return approved;
  }

  /** Reprovar a candidatura fecha as contas conectadas e avisa a pessoa uma vez. */
  async rejectAllFor(profileId: ProfileId, note: string, actorId: ProfileId): Promise<void> {
    for (const platform of [SocialPlatform.Instagram, SocialPlatform.TikTok]) {
      const account = await this.socialAccountRepo.findByProfileAndPlatform(profileId, platform);
      if (account && account.reviewStatus !== AccountReviewStatus.Rejected) {
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
    if (!account) throw new NotFoundException('Conta não encontrada.');
    if (account.profileId !== profileId) throw new ForbiddenException('Essa conta não é sua.');
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

    if (decision === AccountReviewStatus.Approved) {
      const membership = await this.membershipRepo.findByProfileId(account.profileId);
      if (!membership || membership.status !== 'approved') {
        await this.membershipRepo.approve(account.profileId, actorId, now);
        await getPool().query(
          `UPDATE applications
           SET status = 'approved', reviewed_at = now(), reviewed_by = $2, updated_at = now()
           WHERE status = 'pending'
             AND (profile_id = $1 OR lower(email) = lower((SELECT email FROM profiles WHERE id = $1)))`,
          [account.profileId, actorId],
        );
      }
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
