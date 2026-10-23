import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { NotificationsService } from '../../../application/notifications/notifications.service';
import { AuthGuard } from '../guards/auth.guard';
import { uuidPipe } from '../pipes/uuid.pipe';

@Controller('api/notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Req() req: { user: { id: string } }) {
    return this.notifications.listFor(req.user.id);
  }

  @Post(':id/read')
  async markRead(
    @Req() req: { user: { id: string } },
    @Param('id', uuidPipe('Aviso inválido.')) id: string,
  ) {
    await this.notifications.markRead(req.user.id, id);
    return { ok: true };
  }
}
