import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { ITenantCustomerRepository } from '../../core/ports/tenant-customer.repository.port';
import { TenantCustomerEntity } from '../../core/entities/tenant-customer.entity';
import { TenantCustomerMapper } from '../mappers/tenant-customer.mapper';

@Injectable()
export class PrismaTenantCustomerRepository implements ITenantCustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(tenantId: string, id: string): Promise<TenantCustomerEntity | null> {
    const record = await this.prisma.tenantCustomer.findFirst({
      where: {
        id,
        tenantId, // Prisma doesn't support compound unique on id directly in findUnique if id is already PK, but we can use findFirst
      },
      include: {
        user: {
          select: { fullName: true, avatarUrl: true, phone: true }
        },
        orders: {
          where: { status: 'COMPLETED' },
          select: { totalCents: true },
        }
      },
    });

    if (!record) return null;
    
    const completedOrders = (record as any).orders || [];
    const computedTotalOrders = completedOrders.length;
    const computedTotalSpent = completedOrders.reduce((sum: number, o: any) => sum + o.totalCents, 0);
    
    (record as any).totalOrders = computedTotalOrders > 0 ? computedTotalOrders : record.totalOrders;
    (record as any).totalSpentCents = computedTotalSpent > 0 ? computedTotalSpent : record.totalSpentCents;

    return TenantCustomerMapper.toDomain(record);
  }

  async findByTenantAndUserId(tenantId: string, userId: string): Promise<TenantCustomerEntity | null> {
    const raw = await this.prisma.tenantCustomer.findUnique({
      where: {
        tenantId_userId: {
          tenantId,
          userId,
        },
      },
      include: {
        orders: {
          where: { status: 'COMPLETED' },
          select: { totalCents: true },
        }
      }
    });

    if (!raw) return null;

    const completedOrders = (raw as any).orders || [];
    const computedTotalOrders = completedOrders.length;
    const computedTotalSpent = completedOrders.reduce((sum: number, o: any) => sum + o.totalCents, 0);

    (raw as any).totalOrders = computedTotalOrders > 0 ? computedTotalOrders : raw.totalOrders;
    (raw as any).totalSpentCents = computedTotalSpent > 0 ? computedTotalSpent : raw.totalSpentCents;

    return TenantCustomerMapper.toDomain(raw);
  }

  async upsert(customer: TenantCustomerEntity): Promise<TenantCustomerEntity> {
    const persistence = TenantCustomerMapper.toPersistence(customer);

    // Using upsert by composite tenantId_userId, though the composite PK is [tenantId, id]
    // The tenantId_userId is unique, so we can upsert by it.
    const raw = await this.prisma.tenantCustomer.upsert({
      where: {
        tenantId_userId: {
          tenantId: customer.tenantId,
          userId: customer.userId,
        },
      },
      create: persistence,
      update: {
        isVip: persistence.isVip,
        totalSpentCents: persistence.totalSpentCents,
        totalOrders: persistence.totalOrders,
        loyaltyPoints: persistence.loyaltyPoints,
        customerSegment: persistence.customerSegment,
        lastVisitAt: persistence.lastVisitAt,
        internalNotes: persistence.internalNotes,
        dateOfBirth: persistence.dateOfBirth,
        updatedAt: persistence.updatedAt,
      },
    });

    return TenantCustomerMapper.toDomain(raw);
  }
  async findAllByTenant(tenantId: string): Promise<TenantCustomerEntity[]> {
    const rawList = await this.prisma.tenantCustomer.findMany({
      where: { tenantId },
      include: {
        user: {
          select: { 
            fullName: true, 
            avatarUrl: true,
            phone: true,
            authProviders: {
              where: { provider: 'TELEGRAM' },
              select: { displayName: true }
            }
          },
        },
        orders: {
          where: { status: 'COMPLETED' },
          select: { totalCents: true },
        }
      },
      orderBy: { lastVisitAt: 'desc' },
    });

    return rawList.map((raw: any) => {
      const completedOrders = raw.orders || [];
      const computedTotalOrders = completedOrders.length;
      const computedTotalSpent = completedOrders.reduce((sum: number, o: any) => sum + o.totalCents, 0);

      // Override stale values with the computed ones
      raw.totalOrders = computedTotalOrders > 0 ? computedTotalOrders : raw.totalOrders;
      raw.totalSpentCents = computedTotalSpent > 0 ? computedTotalSpent : raw.totalSpentCents;

      return TenantCustomerMapper.toDomain(raw);
    });
  }
}
