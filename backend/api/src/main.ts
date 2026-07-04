import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { DomainErrorFilter } from './shared/nestjs/filters/domain-error.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  app.useGlobalFilters(new DomainErrorFilter());

  app.enableCors({
    origin: (origin, callback) => {
      // In development, allow all origins to prevent Safari/Ngrok blocks
      callback(null, true);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Accept,Authorization,x-tenant-id,x-tenant-slug',
  });

  // Cookie parser required for httpOnly refresh token cookie
  app.use(cookieParser());

  // We use Zod (via ZodValidationPipe per-controller) instead of class-validator.
  // So no global ValidationPipe here.
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });

  const port = Number(process.env.API_PORT ?? 4000);
  const host = process.env.API_HOST ?? '0.0.0.0';

  await app.listen(port, host);
  Logger.log(`XFOS API ready at http://${host}:${port}`, 'Bootstrap');
  Logger.log(`Health: http://${host}:${port}/health`, 'Bootstrap');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
