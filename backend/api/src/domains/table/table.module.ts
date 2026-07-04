import { Module } from '@nestjs/common';
import { TABLE_REPOSITORY_PORT } from './core/ports/table.repository.port';
import { PrismaTableRepository } from './infra/repositories/prisma-table.repository';
import { GetTablesUseCase } from './application/use-cases/get-tables.use-case';
import { CreateTableUseCase } from './application/use-cases/create-table.use-case';
import { UpdateTableUseCase } from './application/use-cases/update-table.use-case';
import { DeleteTableUseCase } from './application/use-cases/delete-table.use-case';
import { TrackPrintUseCase } from './application/use-cases/track-print.use-case';

@Module({
  providers: [
    {
      provide: TABLE_REPOSITORY_PORT,
      useClass: PrismaTableRepository,
    },
    GetTablesUseCase,
    CreateTableUseCase,
    UpdateTableUseCase,
    DeleteTableUseCase,
    TrackPrintUseCase,
  ],
  exports: [
    TABLE_REPOSITORY_PORT,
    GetTablesUseCase,
    CreateTableUseCase,
    UpdateTableUseCase,
    DeleteTableUseCase,
    TrackPrintUseCase,
  ],
})
export class TableModule {}
