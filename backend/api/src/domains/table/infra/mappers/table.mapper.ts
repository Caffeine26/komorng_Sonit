import { Table as PrismaTable, TableShape, TableStatus } from '@xfos/database';
import { RestaurantTable } from '../../core/entities/table.entity';

export class TableMapper {
  static toDomain(raw: PrismaTable & { qrContexts?: { token: string }[] }): RestaurantTable {
    const qrToken = raw.qrContexts?.[0]?.token || null;
    return new RestaurantTable({
      tenantId: raw.tenantId,
      id: raw.id,
      floorPlanId: raw.floorPlanId,
      label: raw.label,
      capacity: raw.capacity ?? 4,
      area: raw.area ?? null, // Table image URL
      shape: raw.shape as 'RECTANGLE' | 'CIRCLE',
      positionX: raw.positionX,
      positionY: raw.positionY,
      width: raw.width,
      height: raw.height,
      rotation: raw.rotation,
      currentStatus: raw.currentStatus as 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING',
      version: raw.version,
      notes: raw.notes,
      isActive: raw.isActive,
      qrToken,
    });
  }

  static toPersistence(domain: RestaurantTable) {
    return {
      tenantId: domain.tenantId,
      id: domain.id,
      floorPlanId: domain.floorPlanId,
      label: domain.label,
      capacity: domain.capacity,
      area: domain.area,
      shape: domain.shape as TableShape,
      positionX: domain.positionX,
      positionY: domain.positionY,
      width: domain.width,
      height: domain.height,
      rotation: domain.rotation,
      currentStatus: domain.currentStatus as TableStatus,
      version: domain.version,
      notes: domain.notes,
      isActive: domain.isActive,
    };
  }
}
