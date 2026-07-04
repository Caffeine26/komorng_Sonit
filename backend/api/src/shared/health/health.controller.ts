import { Controller, Get } from '@nestjs/common';
import { Public } from '../guards/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: '@xfos/backend-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  ready(): { ready: true } {
    // In Phase 2, verify DB + Redis connectivity here.
    return { ready: true };
  }
}
