import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ProfileId } from '../../domain/types';
import { ProfileRepository, UpdateProfileInput } from '../../ports/repositories.port';
import { ClockPort } from '../../ports/clock.port';
import { GetMeUseCase, GetMeResult } from './get-me.use-case';
import { INJECTION_TOKENS } from '../../infrastructure/tokens/injection-tokens';
import { AvatarStoreService } from '../../infrastructure/media/avatar-store.service';

@Injectable()
export class UpdateMeUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.PROFILE_REPOSITORY)
    private readonly profileRepo: ProfileRepository,
    @Inject(INJECTION_TOKENS.CLOCK)
    private readonly clock: ClockPort,
    private readonly getMeUseCase: GetMeUseCase,
    private readonly avatars: AvatarStoreService,
  ) {}

  async execute(
    profileId: ProfileId,
    input: Pick<UpdateProfileInput, 'fullName' | 'publicName' | 'onboardingCompleted'>,
  ): Promise<GetMeResult> {
    const fullName = input.fullName?.trim();
    const publicName = input.publicName?.trim().replace(/\s+/g, ' ');
    if (fullName !== undefined && fullName.length < 2) {
      throw new BadRequestException('Informe o nome completo.');
    }
    if (publicName !== undefined && publicName.length < 2) {
      throw new BadRequestException('Informe o nome que aparece no ranking.');
    }
    await this.profileRepo.update(profileId, {
      ...(fullName !== undefined ? { fullName } : {}),
      ...(publicName !== undefined ? { publicName } : {}),
      ...(input.onboardingCompleted !== undefined
        ? { onboardingCompleted: input.onboardingCompleted }
        : {}),
    });
    return this.getMeUseCase.execute(profileId);
  }

  async setAvatar(profileId: ProfileId, image: string): Promise<GetMeResult> {
    const avatarUrl = await this.avatars.save(profileId, image, this.clock.now());
    await this.profileRepo.update(profileId, { avatarUrl });
    return this.getMeUseCase.execute(profileId);
  }

  async removeAvatar(profileId: ProfileId): Promise<GetMeResult> {
    await this.avatars.remove(profileId);
    await this.profileRepo.update(profileId, { avatarUrl: null });
    return this.getMeUseCase.execute(profileId);
  }
}
