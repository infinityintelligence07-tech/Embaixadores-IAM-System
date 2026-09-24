import { Injectable, Inject } from '@nestjs/common';
import { ProfileId } from '../../domain/types';
import { ProfileRepository, UpdateProfileInput } from '../../ports/repositories.port';
import { GetMeUseCase, GetMeResult } from './get-me.use-case';
import { INJECTION_TOKENS } from '../../infrastructure/tokens/injection-tokens';

@Injectable()
export class UpdateMeUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.PROFILE_REPOSITORY)
    private readonly profileRepo: ProfileRepository,
    private readonly getMeUseCase: GetMeUseCase,
  ) {}

  async execute(
    profileId: ProfileId,
    input: UpdateProfileInput,
  ): Promise<GetMeResult> {
    await this.profileRepo.update(profileId, input);
    return this.getMeUseCase.execute(profileId);
  }
}
