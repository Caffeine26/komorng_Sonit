import { OrderEntity } from '../../core/entities/order.entity';
import { ListOrdersItem } from '@xfos/contracts-bff-admin';

export function mapOrderToListItem(order: OrderEntity): ListOrdersItem {
  const items = order.items.map((item) => ({
    id: item.id,
    itemName: item.itemName,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    variantSnapshot: item.variantSnapshot
      ? {
          ...(item.variantSnapshot as object),
          variantName:
            (item.variantSnapshot as any)?.nameEn ??
            (item.variantSnapshot as any)?.variantName, // Fallback for old data
        }
      : null,
    optionsSnapshot: item.optionsSnapshot
      ? (item.optionsSnapshot as object[]).map((opt: any) => ({
          ...opt,
          name: opt.nameEn ?? opt.name ?? '',
        }))
      : null,
    notes: item.notes ?? null,
    isNewlyAdded: order.isItemNew(item),
    itemStatus: order.status,
  }));

  return {
    orderId: order.id as string,
    orderNumber: order.orderNumber,
    status: order.status,
    tableRef: order.tableRef ?? null,
    tableId: order.tableId ?? null,
    tableImage: order.tableImage ?? null,
    serviceModel: order.serviceModel,
    totalCents: order.totalCents,
    itemCount: order.items.reduce((count, item) => count + item.quantity, 0),
    source: order.source,
    createdAt: (order.createdAt || new Date()).toISOString(),
    submittedAt: order.submittedAt ? order.submittedAt.toISOString() : null,
    items,
    needsAttention: items.some((i) => i.isNewlyAdded),
    customerName: (order as any).customerName ?? null,
    orderToken: order.orderToken,
  };
}
