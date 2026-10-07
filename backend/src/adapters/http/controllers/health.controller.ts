import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { getPool } from '../../../infrastructure/db/pool';

@Controller('api')
export class HealthController {
  @Get('health')
  async health(@Res() res: Response) {
    try {
      await getPool().query('SELECT 1');
      return res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: 'connected',
      });
    } catch (error) {
      console.error('health_check_failed', error instanceof Error ? error.message : error);
      return res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        database: 'error',
        message: 'Banco de dados indisponível no momento.',
      });
    }
  }
}
