import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Inject } from '@nestjs/common';
import { AuthPort } from '../../../ports/auth.port';
import { ProfileRepository } from '../../../ports/repositories.port';
import { INJECTION_TOKENS } from '../../../infrastructure/tokens/injection-tokens';
import { StaffAccessService } from '../../../application/identity/staff-access.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(INJECTION_TOKENS.AUTH)
    private readonly auth: AuthPort,
    @Inject(INJECTION_TOKENS.PROFILE_REPOSITORY)
    private readonly profileRepo: ProfileRepository,
    private readonly staff: StaffAccessService,
  ) {}
  
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Entre na sua conta para continuar.');
    }
    
    const token = authHeader.substring(7);
    
    try {
      const authUser = await this.auth.verifyAccessToken(token);
      
      // CRITICAL: Load profile from database to get real role
      const profile = await this.profileRepo.findById(authUser.id);
      if (!profile || profile.deletedAt) {
        throw new UnauthorizedException('Não encontramos o seu perfil. Entre de novo ou fale com a equipe.');
      }
      
      // Attach to request with role from database
      const role = await this.staff.apply(profile);
      request.user = {
        id: profile.id,
        email: profile.email,
        role,
      };
      
      return true;
    } catch (error) {
      throw new UnauthorizedException('Sua sessão expirou. Entre de novo para continuar.');
    }
  }
}
