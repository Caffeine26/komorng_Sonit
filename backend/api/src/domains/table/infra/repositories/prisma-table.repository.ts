import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { RestaurantTable } from '../../core/entities/table.entity';
import { ITableRepository } from '../../core/ports/table.repository.port';
import { TableMapper } from '../mappers/table.mapper';

@Injectable()
export class PrismaTableRepository implements ITableRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(tenantId: string, id: string): Promise<RestaurantTable | null> {
    const raw = await this.prisma.table.findUnique({
      where: {
        tenantId_id: {
          tenantId,
          id,
        },
      },
      include: {
        qrContexts: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!raw) return null;
    return TableMapper.toDomain(raw);
  }

  async listActive(tenantId: string): Promise<RestaurantTable[]> {
    const raws = await this.prisma.table.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      include: {
        qrContexts: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return raws.map((raw) => TableMapper.toDomain(raw));
  }

  async save(table: RestaurantTable): Promise<void> {
    const data = TableMapper.toPersistence(table);
    await this.prisma.table.update({
      where: {
        tenantId_id: {
          tenantId: table.tenantId,
          id: table.id,
        },
      },
      data,
    });
  }

  async create(table: RestaurantTable, qrToken: string, createdById: string): Promise<void> {
    const data = TableMapper.toPersistence(table);

    // 1. Get or create a default FloorPlan for this tenant to satisfy database foreign keys
    let floorPlan = await this.prisma.floorPlan.findFirst({
      where: { tenantId: table.tenantId },
    });

    if (!floorPlan) {
      floorPlan = await this.prisma.floorPlan.create({
        data: {
          tenantId: table.tenantId,
          name: 'Main Floor',
          isActive: true,
        },
      });
    }

    // Update the mapped persistence object with the valid floorPlanId
    data.floorPlanId = floorPlan.id;

    // 2. Perform atomic creation of both Table and QrContext in a transaction
    await this.prisma.$transaction(async (tx) => {
      await tx.table.create({
        data,
      });

      await tx.qrContext.create({
        data: {
          tenantId: table.tenantId,
          tableId: table.id,
          token: qrToken,
          label: `${table.label} QR`,
          contextType: 'TABLE',
          isActive: true,
          createdById,
        },
      });
    });
  }

  async deactivateQr(tenantId: string, tableId: string, deactivatedById: string): Promise<void> {
    const qrContext = await this.prisma.qrContext.findFirst({
      where: {
        tenantId,
        tableId,
        isActive: true,
      },
    });

    if (qrContext) {
      await this.prisma.qrContext.update({
        where: {
          tenantId_id: {
            tenantId,
            id: qrContext.id,
          },
        },
        data: {
          isActive: false,
          deactivatedAt: new Date(),
          deactivatedById,
          deactivationReason: 'MERCHANT_DISABLED',
        },
      });
    }
  }

  async incrementPrintCount(tenantId: string, tableId: string): Promise<void> {
    const qrContext = await this.prisma.qrContext.findFirst({
      where: {
        tenantId,
        tableId,
        isActive: true,
      },
    });

    if (qrContext) {
      await this.prisma.qrContext.update({
        where: {
          tenantId_id: {
            tenantId,
            id: qrContext.id,
          },
        },
        data: {
          printCount: { increment: 1 },
          lastPrintedAt: new Date(),
        },
      });
    }
  }

  async provisionQrIfMissing(tenantId: string, tableId: string, label: string, createdById: string): Promise<string> {
    const existing = await this.prisma.qrContext.findFirst({
      where: {
        tenantId,
        tableId,
        isActive: true,
      },
    });

    if (existing) {
      return existing.token;
    }

    // Generate and provision a fresh active QrContext token
    const token = `tbl_${tableId}_${Math.random().toString(36).substr(2, 9)}`;
    await this.prisma.qrContext.create({
      data: {
        tenantId,
        tableId,
        token,
        label: `${label} QR`,
        contextType: 'TABLE',
        isActive: true,
        createdById,
      },
    });

    return token;
  }
}
