import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Inject } from '@nestjs/common';
import { AuthPort } from '../../../ports/auth.port';
import { ProfileRepository } from '../../../ports/repositories.port';
import { INJECTION_TOKENS } from '../../../infrastructure/tokens/injection-tokens';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(INJECTION_TOKENS.AUTH)
    private readonly auth: AuthPort,
    @Inject(INJECTION_TOKENS.PROFILE_REPOSITORY)
    private readonly profileRepo: ProfileRepository,
  ) {}
  
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }
    
    const token = authHeader.substring(7);
    
    try {
      const authUser = await this.auth.verifyAccessToken(token);
      
      // CRITICAL: Load profile from database to get real role
      const profile = await this.profileRepo.findById(authUser.id);
      if (!profile || profile.deletedAt) {
        throw new UnauthorizedException('Profile not found or deleted');
      }
      
      // Attach to request with role from database
      request.user = {
        id: profile.id,
        email: profile.email,
        role: profile.role, // From database, NOT from JWT
      };
      
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
