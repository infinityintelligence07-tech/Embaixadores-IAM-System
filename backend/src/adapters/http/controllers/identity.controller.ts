import { Controller, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { GetMeUseCase } from '../../../application/identity/get-me.use-case';
import { UpdateMeUseCase } from '../../../application/identity/update-me.use-case';
import { UpdateProfileDto } from '../dto/update-profile.dto';

@Controller('api')
@UseGuards(AuthGuard)
export class IdentityController {
  constructor(
    private readonly getMeUseCase: GetMeUseCase,
    private readonly updateMeUseCase: UpdateMeUseCase,
  ) {}
  
  @Get('me')
  async getMe(@Req() req: any) {
    const result = await this.getMeUseCase.execute(req.user.id);
    
    return {
      id: result.id,
      email: result.email,
      fullName: result.fullName,
      publicName: result.publicName,
      avatarUrl: result.avatarUrl,
      role: result.role,
      status: result.status,
      onboardingCompleted: result.onboardingCompleted,
      createdAt: result.createdAt.toISOString(),
    };
  }
  
  @Patch('me')
  async updateMe(@Req() req: any, @Body() dto: UpdateProfileDto) {
    const result = await this.updateMeUseCase.execute(req.user.id, dto);
    
    return {
      id: result.id,
      email: result.email,
      fullName: result.fullName,
      publicName: result.publicName,
      avatarUrl: result.avatarUrl,
      role: result.role,
      status: result.status,
      onboardingCompleted: result.onboardingCompleted,
      createdAt: result.createdAt.toISOString(),
    };
  }
}
