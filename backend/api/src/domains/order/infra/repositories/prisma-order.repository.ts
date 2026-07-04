import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { IOrderRepository, CartSnapshot, CartItemInput } from '../../core/ports/order.repository.port';
import { OrderEntity } from '../../core/entities/order.entity';
import { OrderMapper } from '../mappers/order.mapper';
import { OrderStatus } from '@xfos/contracts-enums';

@Injectable()
export class OrderRepositoryImpl implements IOrderRepository {
  constructor(private readonly prisma: PrismaService) { }

  async save(order: OrderEntity, cartIdToConvert?: string): Promise<void> {
    const { order: prismaOrder, items } = OrderMapper.toPersistence(order);

    // Remove currency if present so it doesn't conflict with Prisma's enum
    const {
      currency,
      tenantId,
      id,
      ...restOrderData
    } = prismaOrder as any;

    await this.prisma.$transaction(async (tx) => {
      // 1. Create the order and items
      await tx.order.create({
        data: {
          tenantId,
          id: id ?? order.id,
          ...restOrderData,
          items: {
            create: items.map(({ tenantId: _, orderId: __, ...itemProps }) => itemProps),
          },
        },
      });

      // 2. Mark the cart as converted if requested
      if (cartIdToConvert) {
        await tx.cart.update({
          where: { tenantId_id: { tenantId: order.tenantId, id: cartIdToConvert } },
          data: { status: 'CONVERTED' },
        });
      }

      // 3. Update OrderSession running totals (first order in session only)
      if (order.sessionId) {
        await tx.orderSession.updateMany({
          where: { tenantId: order.tenantId, id: order.sessionId, status: 'ACTIVE' },
          data: {
            orderCount: { increment: 1 },
            subtotalCents: { increment: order.subtotalCents },
            totalCents: { increment: order.totalCents },
            lastActivityAt: new Date(),
          },
        });
      }

      if (order.sessionId && cartIdToConvert) {
        await this.createActiveCartForSessionInTx(tx, order.tenantId, order.sessionId);
      }
    });
  }

  async update(order: OrderEntity): Promise<void> {
    const { order: prismaOrder } = OrderMapper.toPersistence(order);

    await this.prisma.$transaction(async (tx) => {
      // 1. Delete old items
      await tx.orderItem.deleteMany({
        where: { tenantId: order.tenantId, orderId: order.id as string },
      });

      // 2. Insert current items
      if (order.items.length > 0) {
        await tx.orderItem.createMany({
          data: order.items.map((item) => {
            const mapped = OrderMapper.itemToPersistence(item, order.id as string, order.tenantId);
            return mapped;
          }),
        });
      }

      // 3. Update order
      await tx.order.update({
        where: { tenantId_id: { id: order.id as string, tenantId: order.tenantId } },
        data: {
          status: prismaOrder.status as any,
          subtotalCents: prismaOrder.subtotalCents,
          totalCents: prismaOrder.totalCents,
          discountCents: prismaOrder.discountCents,
          taxCents: prismaOrder.taxCents,
          serviceChargeCents: prismaOrder.serviceChargeCents,
          cancellationReason: prismaOrder.cancellationReason as any,
          cancelledById: prismaOrder.cancelledById,
          version: { increment: 1 },
          submittedAt: prismaOrder.submittedAt,
          estimatedReadyAt: prismaOrder.estimatedReadyAt,
          preparingAt: prismaOrder.preparingAt,
          readyAt: prismaOrder.readyAt,
          completedAt: prismaOrder.completedAt,
          cancelledAt: prismaOrder.cancelledAt,
          orderTokenExpiresAt: prismaOrder.orderTokenExpiresAt,
          userId: prismaOrder.userId,
          tenantCustomerId: prismaOrder.tenantCustomerId,
        },
      });
    });

    if (prismaOrder.status === 'COMPLETED' && prismaOrder.sessionId) {
      await this.closeSessionForOrder(order.tenantId, prismaOrder.sessionId as string);
    }
  }

  private async closeSessionForOrder(tenantId: string, sessionId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const session = await tx.orderSession.findUnique({
        where: { tenantId_id: { tenantId, id: sessionId } },
        select: { tableId: true },
      });

      await tx.orderSession.updateMany({
        where: { tenantId, id: sessionId, status: 'ACTIVE' },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedReason: 'STAFF_FORCE_CLOSED',
        },
      });

      if (session?.tableId) {
        await tx.table.update({
          where: { tenantId_id: { tenantId, id: session.tableId } },
          data: { currentStatus: 'AVAILABLE' },
        });
      }
    });
  }

  private async createActiveCartForSessionInTx(
    tx: {
      cart: PrismaService['cart'];
    },
    tenantId: string,
    sessionId: string,
  ): Promise<void> {
    const existing = await tx.cart.findFirst({
      where: { tenantId, sessionId, status: 'ACTIVE' },
    });
    if (existing) return;

    await tx.cart.create({
      data: {
        tenantId,
        id: randomUUID(),
        sessionId,
        status: 'ACTIVE',
        version: 1,
      },
    });
  }

  async findById(tenantId: string, orderId: string): Promise<OrderEntity | null> {
    const prismaOrder = await this.prisma.order.findUnique({
      where: { tenantId_id: { id: orderId, tenantId } },
      include: { items: true },
    });

    if (!prismaOrder) return null;
    return OrderMapper.toDomain(prismaOrder);
  }

  async findByToken(token: string): Promise<OrderEntity | null> {
    const prismaOrder = await this.prisma.order.findUnique({
      where: { orderToken: token },
      include: { items: true, table: true, user: true },
    });

    if (!prismaOrder) return null;
    
    const userObj = (prismaOrder as any).user;
    let customerName = userObj?.fullName ?? null;
    if (userObj && !customerName && userObj.phone) {
      let phone = userObj.phone;
      if (phone.startsWith('+855')) phone = '0' + phone.slice(4);
      else if (phone.startsWith('855')) phone = '0' + phone.slice(3);
      customerName = phone;
    }
    
    return OrderMapper.toDomain({ ...prismaOrder, customerName } as any);
  }

  async findHistoryBySessionId(sessionId: string): Promise<OrderEntity[]> {
    const orders = await this.prisma.order.findMany({
      where: { sessionId },
      include: { items: true, table: true, user: true },
      orderBy: { orderDate: 'asc' },
    });
    return orders.map((o) => {
      const userObj = (o as any).user;
      let customerName = userObj?.fullName ?? null;
      if (userObj && !customerName && userObj.phone) {
        let phone = userObj.phone;
        if (phone.startsWith('+855')) phone = '0' + phone.slice(4);
        else if (phone.startsWith('855')) phone = '0' + phone.slice(3);
        customerName = phone;
      }
      return OrderMapper.toDomain({ ...o, customerName } as any);
    });
  }

  async findByTenant(tenantId: string, filters?: {
    status?: OrderStatus;
    sessionId?: string;
    tableId?: string;
    limit?: number;
    offset?: number;
  }): Promise<OrderEntity[]> {
    const where: any = { tenantId };

    if (filters?.status) where.status = filters.status;
    if (filters?.sessionId) where.sessionId = filters.sessionId;
    if (filters?.tableId) where.tableId = filters.tableId;

    const prismaOrders = await this.prisma.order.findMany({
      where,
      include: { items: true, table: true, user: true },
      take: filters?.limit ?? 50,
      skip: filters?.offset ?? 0,
      orderBy: { orderDate: 'desc' },
    });

    return prismaOrders.map(o => {
      const userObj = (o as any).user;
      let customerName = userObj?.fullName ?? null;
      if (userObj && !customerName && userObj.phone) {
        let phone = userObj.phone;
        if (phone.startsWith('+855')) phone = '0' + phone.slice(4);
        else if (phone.startsWith('855')) phone = '0' + phone.slice(3);
        customerName = phone;
      }
      return OrderMapper.toDomain({ ...o, customerName } as any);
    });
  }

  async findByCustomerOrSession(tenantId: string, tenantCustomerId?: string | null, sessionId?: string | null): Promise<OrderEntity[]> {
    if (!tenantCustomerId && !sessionId) return [];

    const prismaOrders = await this.prisma.order.findMany({
      where: { 
        tenantId,
        OR: [
          tenantCustomerId ? { tenantCustomerId } : undefined,
          sessionId ? { sessionId } : undefined,
        ].filter(Boolean) as any,
      },
      include: { items: true, table: true, user: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return prismaOrders.map(o => {
      const userObj = (o as any).user;
      let customerName = userObj?.fullName ?? null;
      if (userObj && !customerName && userObj.phone) {
        let phone = userObj.phone;
        if (phone.startsWith('+855')) phone = '0' + phone.slice(4);
        else if (phone.startsWith('855')) phone = '0' + phone.slice(3);
        customerName = phone;
      }
      return OrderMapper.toDomain({ ...o, customerName } as any);
    });
  }

  async findOpenOrderBySessionId(tenantId: string, sessionId: string): Promise<OrderEntity | null> {
    const prismaOrder = await this.prisma.order.findFirst({
      where: {
        tenantId,
        sessionId,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      include: { items: true, table: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!prismaOrder) return null;
    return OrderMapper.toDomain(prismaOrder);
  }

  async appendCartToOrder(
    tenantId: string,
    orderId: string,
    cart: CartSnapshot,
    cartIdToConvert: string,
  ): Promise<void> {
    if (!cart.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    const addedSubtotal = cart.items.reduce(
      (sum, item) => sum + item.unitPriceCents * item.quantity,
      0,
    );

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { tenantId_id: { tenantId, id: orderId } },
        select: { sessionId: true, status: true },
      });
      if (!order) throw new BadRequestException('Order not found');
      if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
        throw new BadRequestException('Cannot append items to a closed order');
      }

      // Clear the [NEW] badge for all previous rounds so that only the latest round shows as [NEW] on the POS
      await tx.orderItem.updateMany({
        where: { tenantId, orderId },
        data: { kitchenStatus: 'PREPARING' },
      });

      await tx.orderItem.createMany({
        data: cart.items.map((item) => ({
          id: randomUUID(),
          tenantId,
          orderId,
          menuItemId: item.menuItemId,
          itemName: item.itemName,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          lineSubtotalCents: item.unitPriceCents * item.quantity,
          lineTotalCents: item.unitPriceCents * item.quantity,
          variantSnapshot: item.variantSnapshot as object,
          optionsSnapshot: item.optionsSnapshot as object,
          notes: item.notes,
          kitchenStatus: 'NEW',
        })),
      });

      await tx.order.update({
        where: { tenantId_id: { tenantId, id: orderId } },
        data: {
          subtotalCents: { increment: addedSubtotal },
          totalCents: { increment: addedSubtotal },
          version: { increment: 1 },
          ...(order.status === 'READY' ? { status: 'PREPARING' as any } : {}),
        },
      });

      await tx.cart.update({
        where: { tenantId_id: { tenantId, id: cartIdToConvert } },
        data: { status: 'CONVERTED' },
      });

      if (order.sessionId) {
        await tx.orderSession.updateMany({
          where: { tenantId, id: order.sessionId, status: 'ACTIVE' },
          data: {
            subtotalCents: { increment: addedSubtotal },
            totalCents: { increment: addedSubtotal },
            lastActivityAt: new Date(),
          },
        });
        await this.createActiveCartForSessionInTx(tx, tenantId, order.sessionId);
      }
    });
  }

  async appendItemsToOrder(
    tenantId: string,
    orderId: string,
    items: CartSnapshot['items'],
  ): Promise<void> {
    if (!items.length) return;

    const addedSubtotal = items.reduce(
      (sum, item) => sum + item.unitPriceCents * item.quantity,
      0,
    );

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { tenantId_id: { tenantId, id: orderId } },
        select: { sessionId: true, status: true },
      });
      if (!order) throw new BadRequestException('Order not found');
      if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
        throw new BadRequestException('Cannot append items to a closed order');
      }

      // Clear the [NEW] badge for all previous rounds so that only the latest round shows as [NEW] on the POS
      await tx.orderItem.updateMany({
        where: { tenantId, orderId },
        data: { kitchenStatus: 'PREPARING' },
      });

      await tx.orderItem.createMany({
        data: items.map((item) => ({
          id: randomUUID(),
          tenantId,
          orderId,
          menuItemId: item.menuItemId,
          itemName: item.itemName,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          lineSubtotalCents: item.unitPriceCents * item.quantity,
          lineTotalCents: item.unitPriceCents * item.quantity,
          variantSnapshot: item.variantSnapshot as object,
          optionsSnapshot: item.optionsSnapshot as object,
          notes: item.notes,
        })),
      });

      await tx.order.update({
        where: { tenantId_id: { tenantId, id: orderId } },
        data: {
          subtotalCents: { increment: addedSubtotal },
          totalCents: { increment: addedSubtotal },
          version: { increment: 1 },
          ...(order.status === 'READY' ? { status: 'PREPARING' as any } : {}),
        },
      });

      if (order.sessionId) {
        await tx.orderSession.updateMany({
          where: { tenantId, id: order.sessionId, status: 'ACTIVE' },
          data: {
            subtotalCents: { increment: addedSubtotal },
            totalCents: { increment: addedSubtotal },
            lastActivityAt: new Date(),
          },
        });
      }
    });
  }

  async acknowledgeNewItems(tenantId: string, orderId: string): Promise<OrderEntity | null> {
    const existing = await this.findById(tenantId, orderId);
    if (!existing) return null;

    await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.updateMany({
        where: { tenantId, orderId, kitchenStatus: 'NEW' },
        data: { kitchenStatus: 'PREPARING' },
      });

      await tx.order.update({
        where: { tenantId_id: { tenantId, id: orderId } },
        data: { version: { increment: 1 } },
      });
    });

    return this.findById(tenantId, orderId);
  }

  async createActiveCartForSession(tenantId: string, sessionId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.createActiveCartForSessionInTx(tx, tenantId, sessionId);
    });
  }

  
   





  // Preferred method: retrieve cart by sessionId
  async findCartBySessionId(tenantId: string, sessionId: string): Promise<CartSnapshot | null> {
    const cart = await this.prisma.cart.findFirst({
      where: { tenantId, sessionId, status: 'ACTIVE' },
      include: { items: { include: { menuItem: true } } },
    });
    if (!cart) return null;
    return {
      id: cart.id,
      sessionId: cart.sessionId,
      items: cart.items.map(item => ({
        menuItemId: item.menuItemId ?? '',
        itemName: `${item.menuItem?.nameKm ?? 'Unknown Item'} / ${item.menuItem?.nameEn ?? 'Unknown Item'}`,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        variantSnapshot: item.variantSnapshot,
        optionsSnapshot: item.optionsSnapshot,
        notes: item.notes,
      })),
    };
  }

  // Append items to existing active session cart (idempotent placeholder)
  async appendItemsToSession(tenantId: string, sessionId: string, items: CartItemInput[], requestId?: string): Promise<void> {
    const session = await this.prisma.orderSession.findUnique({
      where: { tenantId_id: { tenantId, id: sessionId } },
      select: { version: true },
    });
    if (!session) throw new BadRequestException('Session not found');

    // TODO: handle requestId idempotency
    await this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({
        where: { tenantId_id: { tenantId, id: sessionId } },
      });
      if (!cart) throw new BadRequestException('Cart not found for session');

      await tx.cartItem.createMany({
        data: items.map(item => ({
          tenantId,
          cartId: cart.id,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          variantSnapshot: item.variantSnapshot as any,
          optionsSnapshot: item.optionsSnapshot as any,
          notes: item.notes ?? null,
        })),
      });

      // Optimistic lock: increment version
      await tx.orderSession.update({
        where: { tenantId_id: { tenantId, id: sessionId }, version: session.version },
        data: { version: { increment: 1 }, lastActivityAt: new Date() },
      });
    });
  }

  async markCartConverted(tenantId: string, cartId: string): Promise<void> {
    await this.prisma.cart.update({
      where: { tenantId_id: { tenantId, id: cartId } },
      data: { status: 'CONVERTED' },
    });
  }

  async allocateOrderNumber(tenantId: string, suffix?: string): Promise<string> {
    // Fetch the tenant's code prefix (e.g. OHL)
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { codePrefix: true },
    });

    const prefix = tenant?.codePrefix ?? '';

    if (suffix) {
      return `${prefix}-${suffix}`;
    }

    // Generate a 5-character hex random string (e.g. DA2FF)
    const randomHex = Math.floor(Math.random() * 0xfffff)
      .toString(16)
      .toUpperCase()
      .padStart(5, '0');

    return `${prefix}-${randomHex}`;
  }
}
