import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@xfos/database';

/**
 * The ONE PrismaClient for the backend process.
 *
 * Lazy connect: we do not call `$connect()` in onModuleInit so the API
 * can boot without a live database (useful for running /health while
 * debugging env setup). The first actual query will open the pool.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    this.logger.log('PrismaService initialized (connection is lazy)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
