import { Controller, Get } from '@nestjs/common';
import { getPool } from '../../../infrastructure/db/pool';

@Controller('api')
export class HealthController {
  @Get('health')
  async health() {
    try {
      const pool = getPool();
      await pool.query('SELECT 1');
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: 'connected',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        database: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
