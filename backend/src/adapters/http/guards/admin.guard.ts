import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AppRole } from '../../../domain/types';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    if (!user || user.role !== AppRole.Admin) {
      throw new ForbiddenException('Área restrita à administração.');
    }
    
    return true;
  }
}
