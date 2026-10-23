import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class RequestSyncDto {
  @IsUUID('4', { message: 'Pessoa inválida.' })
  userId!: string;

  @IsIn(['instagram', 'tiktok'], { message: 'Plataforma inválida.' })
  platform!: 'instagram' | 'tiktok';
}

export class ReasonDto {
  @IsOptional()
  @IsString({ message: 'A justificativa precisa ser um texto.' })
  @MaxLength(500, { message: 'A justificativa pode ter no máximo 500 caracteres.' })
  reason?: string;
}

export class ExcludeContentDto {
  @IsString({ message: 'A justificativa precisa ser um texto.' })
  @MaxLength(500, { message: 'A justificativa pode ter no máximo 500 caracteres.' })
  reason!: string;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsInt({ message: 'O intervalo de coleta precisa ser um número inteiro.' })
  @Min(10, { message: 'O intervalo de coleta é fixo em 10 minutos.' })
  @Max(10, { message: 'O intervalo de coleta é fixo em 10 minutos.' })
  syncIntervalMinutes?: number;

  @IsOptional()
  @IsInt({ message: 'A tolerância precisa ser um número inteiro de horas.' })
  @Min(1, { message: 'A tolerância mínima é 1 hora.' })
  @Max(168, { message: 'A tolerância máxima é 168 horas.' })
  staleToleranceHours?: number;

  @IsOptional()
  @IsInt({ message: 'O intervalo entre coletas manuais precisa ser um número inteiro de segundos.' })
  @Min(0, { message: 'O intervalo entre coletas manuais não pode ser negativo.' })
  @Max(86_400, { message: 'O intervalo entre coletas manuais pode ser de no máximo 24 horas.' })
  manualSyncCooldownSeconds?: number;
}

export class UpdateApplicationDto {
  @IsIn(['pending', 'approved', 'rejected'], { message: 'Status inválido.' })
  status!: 'pending' | 'approved' | 'rejected';

  @IsOptional()
  @IsString({ message: 'O motivo precisa ser um texto.' })
  @MaxLength(500, { message: 'O motivo pode ter no máximo 500 caracteres.' })
  note?: string;
}

export class ReviewAccountDto {
  @IsIn(['approved', 'changes_requested', 'rejected'], {
    message: 'Escolha aprovar, pedir ajuste ou reprovar.',
  })
  decision!: 'approved' | 'changes_requested' | 'rejected';

  @IsOptional()
  @IsString({ message: 'O recado precisa ser um texto.' })
  @MaxLength(500, { message: 'O recado pode ter no máximo 500 caracteres.' })
  note?: string;
}

export class CreateCampaignDto {
  @IsString({ message: 'Dê um nome para a campanha.' })
  @MaxLength(80, { message: 'O nome pode ter no máximo 80 caracteres.' })
  name!: string;

  @IsString({ message: 'Informe a data de início.' })
  startDate!: string;

  @IsString({ message: 'Informe a data de fim.' })
  endDate!: string;
}

export class RankingModeDto {
  @IsIn(['monthly', 'campaign'], { message: 'Escolha mensal ou por campanha.' })
  mode!: 'monthly' | 'campaign';
}
