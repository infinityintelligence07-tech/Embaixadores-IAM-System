import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { ProfileId } from '../../domain/types';
import { ProfileRepository, MembershipRepository } from '../../ports/repositories.port';
import { INJECTION_TOKENS } from '../../infrastructure/tokens/injection-tokens';
import { StaffAccessService } from './staff-access.service';

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
    private readonly staff: StaffAccessService,
  ) {}

  async execute(profileId: ProfileId): Promise<GetMeResult> {
    const profile = await this.profileRepo.findById(profileId);
    if (!profile) {
      throw new NotFoundException('Perfil não encontrado');
    }

    const role = await this.staff.apply(profile);
    const membership = await this.membershipRepo.findByProfileId(profileId);

    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.fullName,
      publicName: profile.publicName,
      avatarUrl: profile.avatarUrl,
      role,
      status: membership?.status || 'pending',
      onboardingCompleted: role === 'admin' ? true : profile.onboardingCompleted,
      createdAt: profile.createdAt,
    };
  }
}
