import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApplicationsService } from '../../../application/applications/applications.service';
import { UpdateApplicationDto } from '../dto/admin.dto';
import { AuthGuard } from '../guards/auth.guard';
import { AdminGuard } from '../guards/admin.guard';
import { uuidPipe } from '../pipes/uuid.pipe';
import { ProfileRepository } from '../../../ports/repositories.port';
import { INJECTION_TOKENS } from '../../../infrastructure/tokens/injection-tokens';

@Controller('api/applications')
export class ApplicationsController {
  constructor(
    private readonly applications: ApplicationsService,
    @Inject(INJECTION_TOKENS.PROFILE_REPOSITORY)
    private readonly profiles: ProfileRepository,
  ) {}

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  submit(@Body() body: Record<string, unknown>) {
    return this.applications.submit({
      nome_completo: stringField(body.nome_completo),
      email: stringField(body.email),
      whatsapp: stringField(body.whatsapp),
      password: stringField(body.password),
      ranking_consent: body.ranking_consent === true,
    });
  }

  /** Quem entrou pelo Google completa aqui o WhatsApp e o consentimento. */
  @Post('complete')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async complete(@Req() req: { user: { id: string } }, @Body() body: Record<string, unknown>) {
    const profile = await this.profiles.findById(req.user.id as never);
    if (!profile) throw new BadRequestException('Perfil não encontrado. Entre de novo.');
    return this.applications.completeSignup(
      { id: profile.id, email: profile.email, fullName: profile.fullName },
      {
        whatsapp: stringField(body.whatsapp),
        ranking_consent: body.ranking_consent === true,
      },
    );
  }
}

@Controller('api/admin/applications')
@UseGuards(AuthGuard, AdminGuard)
export class AdminApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get()
  list() {
    return this.applications.list();
  }

  @Patch(':id')
  update(
    @Req() req: { user: { id: string } },
    @Param('id', uuidPipe('Candidatura inválida.')) id: string,
    @Body() body: UpdateApplicationDto,
  ) {
    return this.applications.updateStatus(id, body.status, req.user.id, body.note);
  }

  @Delete(':id')
  async remove(@Param('id', uuidPipe('Candidatura inválida.')) id: string) {
    await this.applications.remove(id);
    return { ok: true };
  }
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
