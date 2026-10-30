import { Controller, Get, Patch, Post, Delete, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { GetMeUseCase, GetMeResult } from '../../../application/identity/get-me.use-case';
import { UpdateMeUseCase } from '../../../application/identity/update-me.use-case';
import { UpdateProfileDto, UploadAvatarDto } from '../dto/update-profile.dto';

function present(result: GetMeResult) {
  return {
    id: result.id,
    email: result.email,
    fullName: result.fullName,
    publicName: result.publicName,
    avatarUrl: result.avatarUrl,
    role: result.role,
    status: result.status,
    onboardingCompleted: result.onboardingCompleted,
    needsSignupDetails: result.needsSignupDetails,
    createdAt: result.createdAt.toISOString(),
  };
}

@Controller('api')
@UseGuards(AuthGuard)
export class IdentityController {
  constructor(
    private readonly getMeUseCase: GetMeUseCase,
    private readonly updateMeUseCase: UpdateMeUseCase,
  ) {}
  
  @Get('me')
  async getMe(@Req() req: any) {
    return present(await this.getMeUseCase.execute(req.user.id));
  }
  
  @Patch('me')
  async updateMe(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return present(await this.updateMeUseCase.execute(req.user.id, dto));
  }

  @Post('me/avatar')
  async uploadAvatar(@Req() req: any, @Body() dto: UploadAvatarDto) {
    return present(await this.updateMeUseCase.setAvatar(req.user.id, dto.image));
  }

  @Delete('me/avatar')
  async removeAvatar(@Req() req: any) {
    return present(await this.updateMeUseCase.removeAvatar(req.user.id));
  }
}
