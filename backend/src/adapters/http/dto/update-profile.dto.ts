import { IsString, IsOptional, IsBoolean, MaxLength, MinLength } from 'class-validator';

// A foto só entra pelo envio de arquivo (POST /api/me/avatar), nunca por link.
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Informe o nome completo.' })
  @MaxLength(120, { message: 'O nome completo pode ter até 120 caracteres.' })
  fullName?: string;
  
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Informe o nome que aparece no ranking.' })
  @MaxLength(60, { message: 'O nome no ranking pode ter até 60 caracteres.' })
  publicName?: string;
  
  @IsOptional()
  @IsBoolean()
  onboardingCompleted?: boolean;
}

export class UploadAvatarDto {
  @IsString()
  @MaxLength(3_000_000, { message: 'A foto passou de 2 MB. Escolha uma imagem menor.' })
  image!: string;
}
