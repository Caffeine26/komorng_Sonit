import { Controller, Get } from '@nestjs/common';
import { Public } from './shared/guards/public.decorator';

@Controller()
export class AppController {
  @Get()
  @Public()
  index() {
    return {
      status: 'ok',
      service: '@xfos/backend-api',
      message: 'XFOS Backend API is running successfully',
      timestamp: new Date().toISOString(),
    };
  }
}
