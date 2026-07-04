import { NotFoundError } from '../../../../shared/errors/domain-error';
import { Inject, Injectable } from '@nestjs/common';
import { RestaurantTable } from '../../core/entities/table.entity';
import { ITableRepository, TABLE_REPOSITORY_PORT } from '../../core/ports/table.repository.port';

@Injectable()
export class UpdateTableUseCase {
  constructor(
    @Inject(TABLE_REPOSITORY_PORT)
    private readonly tableRepo: ITableRepository,
  ) {}

  async execute(
    tenantId: string,
    tableId: string,
    payload: { name: string; capacity: number | string; status?: string; image?: string | null }
  ): Promise<RestaurantTable> {
    const table = await this.tableRepo.findById(tenantId, tableId);
    if (!table) {
      throw new NotFoundError('Table not found');
    }

    const parsedCapacity = payload.capacity !== undefined
      ? (typeof payload.capacity === 'number' ? payload.capacity : parseInt(payload.capacity as string, 10) || 4)
      : undefined;

    // Validate and update fields natively inside the pure entity
    table.updateDetails({
      name: payload.name,
      capacity: parsedCapacity,
      status: payload.status,
      image: payload.image,
    });

    await this.tableRepo.save(table);
    return table;
  }
}
