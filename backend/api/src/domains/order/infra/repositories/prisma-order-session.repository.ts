import { Injectable } from '@nestjs/common';
import { IOrderSessionRepository, OrderSessionDto, QrContextDto } from '../../core/ports/order-session.repository.port';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

@Injectable()
export class PrismaOrderSessionRepository implements IOrderSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findSessionById(tenantId: string, sessionId: string): Promise<OrderSessionDto | null> {
    return this.prisma.orderSession.findFirst({
      where: { tenantId, id: sessionId },
      include: { qrContext: { include: { table: true } } },
    }) as Promise<OrderSessionDto | null>;
  }

  async findActiveSession(tenantId: string, sessionId: string): Promise<OrderSessionDto | null> {
    return this.prisma.orderSession.findFirst({
      where: { tenantId, id: sessionId, status: 'ACTIVE' },
      include: { qrContext: { include: { table: true } } },
    }) as Promise<OrderSessionDto | null>;
  }

  async createSession(tenantId: string, data: any): Promise<OrderSessionDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const session = await tx.orderSession.create({
          data: { ...data, tenantId },
        });

        if (data.tableId) {
          await tx.table.update({
            where: { tenantId_id: { tenantId, id: data.tableId } },
            data: { currentStatus: 'OCCUPIED' },
          });
        }

        return session as OrderSessionDto;
      });
    } catch (error: any) {
      // P2002 is Prisma's unique constraint violation error.
      // If we violate the one-ACTIVE-per-table partial index, we catch it 
      // and atomically return the existing active session instead of crashing.
      if (error.code === 'P2002' && data.tableId) {
        const existingSession = await this.findActiveSessionByTable(tenantId, data.tableId);
        if (existingSession) {
          return existingSession;
        }
      }
      throw error;
    }
  }

  async updateSession(tenantId: string, sessionId: string, data: any): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const session = await tx.orderSession.update({
        where: { tenantId_id: { tenantId, id: sessionId } },
        data,
      });

      if (data.status === 'CLOSED' && session.tableId) {
        await tx.table.update({
          where: { tenantId_id: { tenantId, id: session.tableId } },
          data: { currentStatus: 'AVAILABLE' },
        });
      }
    });
  }

  async findActiveSessionByQrContext(tenantId: string, qrContextId: string): Promise<OrderSessionDto | null> {
    return this.prisma.orderSession.findFirst({
      where: { tenantId, qrContextId, status: 'ACTIVE' },
    }) as Promise<OrderSessionDto | null>;
  }

  async findActiveSessionByTable(tenantId: string, tableId: string): Promise<OrderSessionDto | null> {
    return this.prisma.orderSession.findFirst({
      where: { tenantId, tableId, status: 'ACTIVE' },
      include: { qrContext: { include: { table: true } } },
    }) as Promise<OrderSessionDto | null>;
  }

  async refreshSessionActivity(tenantId: string, sessionId: string): Promise<void> {
    await this.prisma.orderSession.update({
      where: { tenantId_id: { tenantId, id: sessionId } },
      data: { lastActivityAt: new Date() },
    });
  }

  async findQrContextByTokenGlobal(token: string): Promise<any | null> {
    return this.prisma.qrContext.findUnique({
      where: { token },
      include: { table: true },
    });
  }

  async findQrContextByToken(tenantId: string, token: string): Promise<QrContextDto | null> {
    return this.prisma.qrContext.findFirst({
      where: { tenantId, token },
      include: { table: true },
    }) as Promise<QrContextDto | null>;
  }

  async updateQrContextSession(tenantId: string, qrContextId: string, sessionId: string): Promise<void> {
    // No activeSessionId on QrContext. Removed.
  }

  async incrementQrScan(tenantId: string, qrContextId: string): Promise<void> {
    await this.prisma.qrContext.update({
      where: { tenantId_id: { tenantId, id: qrContextId } },
      data: {
        scanCount: { increment: 1 },
        lastScannedAt: new Date(),
      },
    });
  }

  async findTableById(tenantId: string, tableId: string): Promise<{ id: string; label: string } | null> {
    return this.prisma.table.findUnique({
      where: { tenantId_id: { tenantId, id: tableId } },
      select: { id: true, label: true },
    });
  }
}
