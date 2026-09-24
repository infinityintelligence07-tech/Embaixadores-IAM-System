import { IsString, IsOptional, IsBoolean, IsUrl } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  fullName?: string;
  
  @IsOptional()
  @IsString()
  publicName?: string;
  
  @IsOptional()
  @IsString()
  avatarUrl?: string;
  
  @IsOptional()
  @IsBoolean()
  onboardingCompleted?: boolean;
}
