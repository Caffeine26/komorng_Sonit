import { OrderEntity, OrderProps } from '../../core/entities/order.entity';
import { OrderItemVO } from '../../core/value-objects/order-item.vo';
import { Order as PrismaOrder, OrderItem as PrismaOrderItem } from '@xfos/database';
import { randomUUID } from 'crypto';

export class OrderMapper {
  static toDomain(prismaOrder: PrismaOrder & { items: PrismaOrderItem[], table?: any }): OrderEntity {
    const items = prismaOrder.items.map((item: PrismaOrderItem) =>
      OrderItemVO.create({
        id: item.id,
        menuItemId: item.menuItemId ?? '',
        itemName: item.itemName,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        variantSnapshot: item.variantSnapshot,
        optionsSnapshot: item.optionsSnapshot,
        notes: item.notes ?? undefined,
        createdAt: item.createdAt,
        kitchenStatus: item.kitchenStatus ?? undefined,
        kitchenTicketId: (item as any).kitchenTicketId ?? undefined,
      })
    );

    const props: OrderProps = {
      tenantId: prismaOrder.tenantId,
      id: prismaOrder.id,
      sessionId: prismaOrder.sessionId ?? undefined,
      tableId: prismaOrder.tableId ?? undefined,
      qrContextId: prismaOrder.qrContextId ?? undefined,
      orderNumber: prismaOrder.orderNumber,
      orderToken: prismaOrder.orderToken,
      status: prismaOrder.status as any,
      serviceModel: prismaOrder.serviceModel as any,
      payTiming: prismaOrder.payTiming as any,
      source: prismaOrder.source as any,
      tableRef: prismaOrder.tableRef,
      tableImage: prismaOrder.table?.area ?? null,
      items,
      subtotalCents: prismaOrder.subtotalCents,
      discountCents: prismaOrder.discountCents,
      taxCents: prismaOrder.taxCents,
      serviceChargeCents: prismaOrder.serviceChargeCents,
      totalCents: prismaOrder.totalCents,
      notes: prismaOrder.notes ?? undefined,
      version: prismaOrder.version,
      cancellationReason: prismaOrder.cancellationReason as any,
      cancelledById: prismaOrder.cancelledById,
      createdById: prismaOrder.createdById,
      userId: (prismaOrder as any).userId,
      tenantCustomerId: (prismaOrder as any).tenantCustomerId,
      customerName: (prismaOrder as any).customerName ?? null,
      locale: (prismaOrder as any).locale ?? 'en',
      estimatedReadyAt: prismaOrder.estimatedReadyAt,
      createdAt: (prismaOrder as any).createdAt,
      submittedAt: prismaOrder.submittedAt,
      preparingAt: prismaOrder.preparingAt,
      readyAt: prismaOrder.readyAt,
      completedAt: prismaOrder.completedAt,
      cancelledAt: prismaOrder.cancelledAt,
      orderTokenExpiresAt: prismaOrder.orderTokenExpiresAt,
    };

    return OrderEntity.reconstruct(props);
  }

  static itemToPersistence(item: OrderItemVO, orderId: string, tenantId: string) {
    return {
      id: item.id || randomUUID(),
      tenantId,
      orderId,
      menuItemId: item.menuItemId,
      itemName: item.itemName,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineSubtotalCents: item.lineTotalCents,
      lineTotalCents: item.lineTotalCents,
      variantSnapshot: item.variantSnapshot as any,
      optionsSnapshot: item.optionsSnapshot as any,
      notes: item.notes,
      createdAt: item.createdAt,
      kitchenStatus: item.kitchenStatus as any,
      kitchenTicketId: item.kitchenTicketId,
    };
  }

  static toPersistence(entity: OrderEntity) {
    const items = entity.items.map(item => OrderMapper.itemToPersistence(item, entity.id as string, entity.tenantId));

    return {
      order: {
        tenantId: entity.tenantId,
        sessionId: entity.sessionId,
        tableId: entity.tableId,
        qrContextId: entity.qrContextId,
        orderDate: entity.createdAt || new Date(),
        orderNumber: entity.orderNumber,
        orderToken: entity.orderToken,
        status: entity.status,
        serviceModel: entity.serviceModel,
        payTiming: entity.payTiming,
        source: entity.source,
        tableRef: entity.tableRef,
        subtotalCents: entity.subtotalCents,
        discountCents: entity.discountCents,
        taxCents: entity.taxCents,
        serviceChargeCents: entity.serviceChargeCents,
        totalCents: entity.totalCents,
        currency: 'USD',
        notes: entity.notes,
        version: entity.version,
        cancellationReason: entity.cancellationReason,
        cancelledById: entity.cancelledById,
        createdById: entity.createdById,
        userId: entity.userId,
        tenantCustomerId: entity.tenantCustomerId,
        locale: entity.locale,
        estimatedReadyAt: entity.estimatedReadyAt,

        submittedAt: entity.submittedAt,
        preparingAt: entity.preparingAt,
        readyAt: entity.readyAt,
        completedAt: entity.completedAt,
        cancelledAt: entity.cancelledAt,
        orderTokenExpiresAt: entity.orderTokenExpiresAt,
      },
      items,
    };
  }
}
