import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { AppModule } from './app.module';
import { DomainErrorFilter } from './shared/nestjs/filters/domain-error.filter';

const server = express();

export async function bootstrap(expressInstance: express.Express) {
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressInstance),
    { logger: ['log', 'error', 'warn', 'debug', 'verbose'] }
  );

  app.useGlobalFilters(new DomainErrorFilter());

  app.enableCors({
    origin: (origin, callback) => {
      callback(null, true);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Accept,Authorization,x-tenant-id,x-tenant-slug',
  });

  app.use(cookieParser());
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });

  await app.init();
  return app;
}

if (!process.env.VERCEL) {
  bootstrap(server).then(() => {
    const port = Number(process.env.API_PORT ?? 4000);
    const host = process.env.API_HOST ?? '0.0.0.0';
    server.listen(port, host, () => {
      Logger.log(`XFOS API ready locally at http://${host}:${port}`, 'Bootstrap');
    });
  });
}

let initializedApp: any = null;

export default async (req: any, res: any) => {
  if (!initializedApp) {
    initializedApp = await bootstrap(server);
  }
  return server(req, res);
};
