import { Inject, Injectable } from '@nestjs/common';
import { RestaurantTable } from '../../core/entities/table.entity';
import { ITableRepository, TABLE_REPOSITORY_PORT } from '../../core/ports/table.repository.port';

@Injectable()
export class CreateTableUseCase {
  constructor(
    @Inject(TABLE_REPOSITORY_PORT)
    private readonly tableRepo: ITableRepository,
  ) {}

  async execute(
    tenantId: string,
    userId: string,
    payload: { name: string; capacity: number | string; image?: string | null }
  ): Promise<RestaurantTable> {
    const tableId = `tbl_${Math.random().toString(36).substr(2, 9)}`;
    const parsedCapacity = typeof payload.capacity === 'number'
      ? payload.capacity
      : parseInt(payload.capacity as string, 10) || 4;

    const table = new RestaurantTable({
      tenantId,
      id: tableId,
      floorPlanId: 'placeholder', // Dynamically resolved by adapter transaction
      label: payload.name,
      capacity: parsedCapacity,
      area: payload.image || null,
      shape: 'RECTANGLE',
      positionX: 50,
      positionY: 50,
      width: 100,
      height: 100,
      rotation: 0,
      currentStatus: 'AVAILABLE',
      version: 1,
      isActive: true,
    });

    const qrToken = `tbl_${tableId}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Save both table and initial active QrContext atomically
    await this.tableRepo.create(table, qrToken, userId);

    table.setQrToken(qrToken);
    return table;
  }
}
