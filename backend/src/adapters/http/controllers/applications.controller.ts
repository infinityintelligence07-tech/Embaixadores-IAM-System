import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApplicationsService } from '../../../application/applications/applications.service';
import { UpdateApplicationDto } from '../dto/admin.dto';
import { AuthGuard } from '../guards/auth.guard';
import { AdminGuard } from '../guards/admin.guard';
import { uuidPipe } from '../pipes/uuid.pipe';

@Controller('api/applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  submit(@Body() body: Record<string, unknown>) {
    return this.applications.submit({
      nome_completo: stringField(body.nome_completo),
      email: stringField(body.email),
      whatsapp: stringField(body.whatsapp),
      redes_sociais: Array.isArray(body.redes_sociais)
        ? body.redes_sociais.filter((item): item is string => typeof item === 'string')
        : [],
      instagram_handle: stringField(body.instagram_handle),
      tiktok_handle: stringField(body.tiktok_handle),
    });
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
  update(@Param('id', uuidPipe('Candidatura inválida.')) id: string, @Body() body: UpdateApplicationDto) {
    return this.applications.updateStatus(id, body.status);
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
