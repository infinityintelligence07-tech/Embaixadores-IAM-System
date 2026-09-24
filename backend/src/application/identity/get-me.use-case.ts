import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { ProfileId } from '../../domain/types';
import { ProfileRepository, MembershipRepository } from '../../ports/repositories.port';
import { INJECTION_TOKENS } from '../../infrastructure/tokens/injection-tokens';

export interface GetMeResult {
  id: string;
  email: string;
  fullName: string;
  publicName: string;
  avatarUrl: string | null;
  role: 'ambassador' | 'admin';
  status: 'pending' | 'approved' | 'suspended';
  onboardingCompleted: boolean;
  createdAt: Date;
}

@Injectable()
export class GetMeUseCase {
  constructor(
    @Inject(INJECTION_TOKENS.PROFILE_REPOSITORY)
    private readonly profileRepo: ProfileRepository,
    @Inject(INJECTION_TOKENS.MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: MembershipRepository,
  ) {}

  async execute(profileId: ProfileId): Promise<GetMeResult> {
    const profile = await this.profileRepo.findById(profileId);
    if (!profile) {
      throw new NotFoundException('Perfil não encontrado');
    }

    const membership = await this.membershipRepo.findByProfileId(profileId);

    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.fullName,
      publicName: profile.publicName,
      avatarUrl: profile.avatarUrl,
      role: profile.role,
      status: membership?.status || 'pending',
      onboardingCompleted: profile.onboardingCompleted,
      createdAt: profile.createdAt,
    };
  }
}
