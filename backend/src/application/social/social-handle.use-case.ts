import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { SocialAccount } from '../../domain/entities';
import { bioHasCode, generateVerificationCode, parseHandle } from '../../domain/social-handle';
import {
  ConnectionStatus,
  ProfileId,
  SocialAccountId,
  SocialPlatform,
  SocialTransport,
} from '../../domain/types';
import { ClockPort } from '../../ports/clock.port';
import {
  AuditRepository,
  ContentRepository,
  SocialAccountRepository,
  SyncJobRepository,
} from '../../ports/repositories.port';
import {
  PublicProfileLookup,
  PublicSocialProfile,
  SocialProfileNotFoundError,
} from '../../ports/social-metrics.port';
import { INJECTION_TOKENS } from '../../infrastructure/tokens/injection-tokens';

const VERIFY_COOLDOWN_MS = 15_000;

function networkName(platform: SocialPlatform): string {
  switch (platform) {
    case SocialPlatform.Instagram:
      return 'Instagram';
    case SocialPlatform.TikTok:
      return 'TikTok';
    default: {
      const exhaustive: never = platform;
      return exhaustive;
    }
  }
}

/**
 * Conexão sem login na rede: o embaixador informa o @, recebe um código e o coloca na bio.
 * A conta só entra na coleta e no ranking depois que o código aparece na bio.
 */
@Injectable()
export class SocialHandleUseCase {
  private readonly lastVerifyAt = new Map<string, number>();

  constructor(
    @Inject(INJECTION_TOKENS.CLOCK)
    private readonly clock: ClockPort,
    @Inject(INJECTION_TOKENS.SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccountRepo: SocialAccountRepository,
    @Inject(INJECTION_TOKENS.SYNC_JOB_REPOSITORY)
    private readonly syncJobRepo: SyncJobRepository,
    @Inject(INJECTION_TOKENS.CONTENT_REPOSITORY)
    private readonly contentRepo: ContentRepository,
    @Inject(INJECTION_TOKENS.AUDIT_REPOSITORY)
    private readonly auditRepo: AuditRepository,
    @Inject(INJECTION_TOKENS.PUBLIC_PROFILE_LOOKUPS)
    private readonly lookups: PublicProfileLookup[],
  ) {}

  isEnabled(platform: SocialPlatform): boolean {
    return this.lookupFor(platform)?.enabled ?? false;
  }

  async claim(
    profileId: ProfileId,
    platform: SocialPlatform,
    rawHandle: string,
  ): Promise<SocialAccount> {
    const name = networkName(platform);
    if (!this.isEnabled(platform)) {
      throw new BadRequestException(`A conexão do ${name} pelo @ ainda não está ativa.`);
    }
    const handle = parseHandle(platform, rawHandle ?? '');
    if (!handle) {
      throw new BadRequestException(`Informe um @ válido do ${name}, como @seuperfil.`);
    }

    const profile = await this.readProfile(platform, handle);
    if (profile.isPrivate) {
      throw new BadRequestException(
        `Essa conta do ${name} está privada. Deixe o perfil público para as views entrarem.`,
      );
    }

    const now = this.clock.now();
    const holder = await this.socialAccountRepo.findAnyByPlatformUserId(
      platform,
      profile.platformUserId,
    );
    if (holder && holder.profileId !== profileId) {
      const holderConfirmed =
        holder.disconnectedAt === null && holder.status !== ConnectionStatus.PendingVerification;
      if (holderConfirmed) {
        throw new ConflictException(
          'Esse @ já está confirmado por outro embaixador. Se ele é seu, fale com a equipe.',
        );
      }
      // Pedido sem confirmação não prende o @: quem provar pela bio fica com ele.
      await this.syncJobRepo.cancelActiveForAccount(holder.id);
      await this.socialAccountRepo.update(holder.id, {
        platformUserId: `released:${holder.id}`,
        status: ConnectionStatus.Disconnected,
        disconnectedAt: holder.disconnectedAt ?? now,
        verificationCode: null,
        verifiedAt: null,
      });
    }

    const mine = await this.socialAccountRepo.findAnyByProfileAndPlatform(profileId, platform);
    const sameAccount = mine?.platformUserId === profile.platformUserId;
    const identity = {
      platformUserId: profile.platformUserId,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      profileUrl: profile.profileUrl,
    };

    if (
      mine &&
      sameAccount &&
      mine.disconnectedAt === null &&
      mine.transport === SocialTransport.PublicApi &&
      mine.verifiedAt
    ) {
      return this.socialAccountRepo.update(mine.id, identity);
    }

    const keepCode =
      mine && sameAccount && mine.status === ConnectionStatus.PendingVerification
        ? mine.verificationCode
        : null;
    const code = keepCode ?? generateVerificationCode((max) => randomInt(max));

    let account: SocialAccount;
    if (mine) {
      await this.syncJobRepo.cancelActiveForAccount(mine.id);
      await this.socialAccountRepo.deleteCredentials(mine.id);
      // Os ids de conteúdo da leitura pelo @ não batem com os da API oficial nem com outra conta.
      if (!sameAccount || mine.transport !== SocialTransport.PublicApi) {
        await this.retireContents(mine.id);
      }
      account = await this.socialAccountRepo.update(mine.id, {
        ...identity,
        transport: SocialTransport.PublicApi,
        status: ConnectionStatus.PendingVerification,
        verificationCode: code,
        verifiedAt: null,
        disconnectedAt: null,
        syncMessage: null,
      });
    } else {
      account = await this.socialAccountRepo.create({
        profileId,
        platform,
        ...identity,
        transport: SocialTransport.PublicApi,
        status: ConnectionStatus.PendingVerification,
        verificationCode: code,
      });
    }

    await this.auditRepo.append({
      actorId: profileId,
      action: 'claim_social_handle',
      entityType: 'social_account',
      entityId: account.id,
      metadata: { platform, username: profile.username },
    });
    return account;
  }

  async verify(profileId: ProfileId, platform: SocialPlatform): Promise<SocialAccount> {
    const name = networkName(platform);
    const account = await this.socialAccountRepo.findByProfileAndPlatform(profileId, platform);
    if (!account || account.transport !== SocialTransport.PublicApi || !account.username) {
      throw new NotFoundException(`Informe o seu @ do ${name} primeiro.`);
    }
    if (account.status !== ConnectionStatus.PendingVerification && account.verifiedAt) {
      return account;
    }
    if (!account.verificationCode) {
      throw new BadRequestException(`Gere um código novo informando o seu @ do ${name}.`);
    }

    const throttleKey = `${profileId}:${platform}`;
    const nowMs = this.clock.now().getTime();
    const last = this.lastVerifyAt.get(throttleKey) ?? 0;
    if (nowMs - last < VERIFY_COOLDOWN_MS) {
      throw new HttpException(
        'Aguarde alguns segundos antes de conferir de novo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.lastVerifyAt.set(throttleKey, nowMs);

    const profile = await this.readProfile(platform, account.username);
    if (profile.platformUserId !== account.platformUserId) {
      throw new BadRequestException('Esse @ agora é de outra conta. Informe o seu @ atual.');
    }
    if (!bioHasCode(profile.bio, account.verificationCode)) {
      throw new UnprocessableEntityException(
        `Ainda não achamos ${account.verificationCode} na bio de @${profile.username}. Salve a bio no ${name} e confira de novo em 1 minuto.`,
      );
    }

    const verified = await this.socialAccountRepo.update(account.id, {
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      status: ConnectionStatus.Connected,
      verifiedAt: this.clock.now(),
      verificationCode: null,
      syncMessage: 'Conta confirmada. A primeira coleta começa agora.',
    });
    await this.syncJobRepo.enqueue({ socialAccountId: account.id, priority: 200 });
    await this.auditRepo.append({
      actorId: profileId,
      action: 'verify_social_handle',
      entityType: 'social_account',
      entityId: account.id,
      metadata: { platform, username: profile.username },
    });
    this.lastVerifyAt.delete(throttleKey);
    return verified;
  }

  private lookupFor(platform: SocialPlatform): PublicProfileLookup | undefined {
    return this.lookups.find((lookup) => lookup.platform === platform);
  }

  private async readProfile(
    platform: SocialPlatform,
    handle: string,
  ): Promise<PublicSocialProfile> {
    const lookup = this.lookupFor(platform);
    if (!lookup) throw new BadRequestException('Plataforma inválida');
    try {
      return await lookup.lookupProfile(handle);
    } catch (error) {
      if (error instanceof SocialProfileNotFoundError) {
        throw new BadRequestException(
          `Não encontramos @${handle} no ${networkName(platform)}. Confira o @ e tente de novo.`,
        );
      }
      throw new ServiceUnavailableException(
        `Não conseguimos consultar o ${networkName(platform)} agora. Tente de novo em instantes.`,
      );
    }
  }

  /** Vídeos que estavam nesta linha não podem contar para a conta lida pelo @. */
  private async retireContents(accountId: SocialAccountId): Promise<void> {
    const contents = await this.contentRepo.findEligibleByAccount(accountId);
    for (const content of contents) {
      await this.contentRepo.markRemoved(content.id);
    }
  }
}
