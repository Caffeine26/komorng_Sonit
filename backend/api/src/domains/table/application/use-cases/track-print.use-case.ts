import { Inject, Injectable } from '@nestjs/common';
import { ITableRepository, TABLE_REPOSITORY_PORT } from '../../core/ports/table.repository.port';

@Injectable()
export class TrackPrintUseCase {
  constructor(
    @Inject(TABLE_REPOSITORY_PORT)
    private readonly tableRepo: ITableRepository,
  ) {}

  async execute(tenantId: string, tableId: string): Promise<void> {
    await this.tableRepo.incrementPrintCount(tenantId, tableId);
  }
}
