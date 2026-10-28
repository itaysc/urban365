import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';

/**
 * Mounted at `/health`, outside the `/api/v1` prefix — Railway's healthcheck
 * (see railway.toml) and uptime probes hit it without an API version in the path.
 */
@Public()
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  @Get()
  check() {
    return {
      status: 'ok',
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }
}
