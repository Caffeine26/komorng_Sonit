import { NotFoundError } from '../../../../shared/errors/domain-error';
import { Inject, Injectable } from '@nestjs/common';
import { ITableRepository, TABLE_REPOSITORY_PORT } from '../../core/ports/table.repository.port';

@Injectable()
export class DeleteTableUseCase {
  constructor(
    @Inject(TABLE_REPOSITORY_PORT)
    private readonly tableRepo: ITableRepository,
  ) {}

  async execute(tenantId: string, tableId: string, userId: string): Promise<void> {
    const table = await this.tableRepo.findById(tenantId, tableId);
    if (!table) {
      throw new NotFoundError('Table not found');
    }

    // Soft delete the domain table entity
    table.softDelete();
    await this.tableRepo.save(table);

    // Safely deactivate the active QR code context using the database reason triad
    await this.tableRepo.deactivateQr(tenantId, tableId, userId);
  }
}
