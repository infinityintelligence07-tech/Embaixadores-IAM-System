import { AppRole, ProfileId } from '../domain/types';

export interface AuthUser {
  id: ProfileId;
  email: string;
  role: AppRole;
}

export interface AuthPort {
  verifyAccessToken(token: string): Promise<AuthUser>;
}
