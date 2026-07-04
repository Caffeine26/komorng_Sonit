import { Inject, Injectable } from '@nestjs/common';
import { RestaurantTable } from '../../core/entities/table.entity';
import { ITableRepository, TABLE_REPOSITORY_PORT } from '../../core/ports/table.repository.port';

@Injectable()
export class GetTablesUseCase {
  constructor(
    @Inject(TABLE_REPOSITORY_PORT)
    private readonly tableRepo: ITableRepository,
  ) {}

  async execute(tenantId: string, userId: string): Promise<RestaurantTable[]> {
    const tables = await this.tableRepo.listActive(tenantId);
    
    for (const table of tables) {
      if (!table.qrToken) {
        const token = await this.tableRepo.provisionQrIfMissing(
          tenantId,
          table.id,
          table.label,
          userId
        );
        table.setQrToken(token);
      }
    }

    return tables;
  }
}
