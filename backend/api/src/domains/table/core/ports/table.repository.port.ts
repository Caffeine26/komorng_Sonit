import { RestaurantTable } from '../entities/table.entity';

export interface ITableRepository {
  findById(tenantId: string, id: string): Promise<RestaurantTable | null>;
  listActive(tenantId: string): Promise<RestaurantTable[]>;
  save(table: RestaurantTable): Promise<void>;
  create(table: RestaurantTable, qrToken: string, createdById: string): Promise<void>;
  deactivateQr(tenantId: string, tableId: string, deactivatedById: string): Promise<void>;
  incrementPrintCount(tenantId: string, tableId: string): Promise<void>;
  provisionQrIfMissing(tenantId: string, tableId: string, label: string, createdById: string): Promise<string>;
}

export const TABLE_REPOSITORY_PORT = Symbol('ITableRepository');
