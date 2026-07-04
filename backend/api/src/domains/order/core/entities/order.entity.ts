import { randomUUID } from 'crypto';
import { OrderItemVO } from '../value-objects/order-item.vo';
import {
  OrderStatus,
  OrderSource,
  ServiceModel,
  PayTiming,
  OrderCancellationReason
} from '@xfos/contracts-enums';
import {
  InvalidOrderTransitionError,
  OrderAlreadyCancelledError,
  EmptyOrderError
} from '../errors/order.errors';

export interface OrderProps {
  tenantId: string;
  id?: string;
  sessionId?: string | null;
  tableId?: string | null;
  qrContextId?: string | null;
  orderNumber: string;
  orderToken: string;
  status: OrderStatus;
  serviceModel: ServiceModel;
  payTiming: PayTiming;
  source: OrderSource;
  tableRef?: string | null;
  tableImage?: string | null;
  items: OrderItemVO[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  serviceChargeCents: number;
  totalCents: number;
  notes?: string;
  version?: number;
  cancellationReason?: OrderCancellationReason | null;
  cancelledById?: string | null;
  createdById?: string | null;
  estimatedReadyAt?: Date | null;
  createdAt?: Date;
  submittedAt?: Date | null;
  preparingAt?: Date | null;
  readyAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  orderTokenExpiresAt?: Date | null;
  userId?: string | null;
  tenantCustomerId?: string | null;
  customerName?: string | null;
  locale?: string;
}

export class OrderEntity {
  private props: OrderProps;

  private constructor(props: OrderProps) {
    this.props = { ...props };
  }

  get tenantId() { return this.props.tenantId; }
  get id() { return this.props.id; }
  get sessionId() { return this.props.sessionId; }
  get tableId() { return this.props.tableId; }
  get tableImage() { return this.props.tableImage; }
  get qrContextId() { return this.props.qrContextId; }
  get orderNumber() { return this.props.orderNumber; }
  get orderToken() { return this.props.orderToken; }
  get status() { return this.props.status; }
  get serviceModel() { return this.props.serviceModel; }
  get payTiming() { return this.props.payTiming; }
  get source() { return this.props.source; }
  get tableRef() { return this.props.tableRef; }
  get items() { return this.props.items; }
  get subtotalCents() { return this.props.subtotalCents; }
  get discountCents() { return this.props.discountCents; }
  get taxCents() { return this.props.taxCents; }
  get serviceChargeCents() { return this.props.serviceChargeCents; }
  get totalCents() { return this.props.totalCents; }
  get notes() { return this.props.notes; }
  get version() { return this.props.version || 1; }
  get cancellationReason() { return this.props.cancellationReason; }
  get cancelledById() { return this.props.cancelledById; }
  get createdById() { return this.props.createdById; }
  get estimatedReadyAt() { return this.props.estimatedReadyAt; }
  get createdAt() { return this.props.createdAt; }
  get submittedAt() { return this.props.submittedAt; }
  get preparingAt() { return this.props.preparingAt; }
  get readyAt() { return this.props.readyAt; }
  get completedAt() { return this.props.completedAt; }
  get cancelledAt() { return this.props.cancelledAt; }
  get orderTokenExpiresAt() { return this.props.orderTokenExpiresAt; }
  get userId() { return this.props.userId; }
  get tenantCustomerId() { return this.props.tenantCustomerId; }
  get customerName() { return this.props.customerName; }
  get locale() { return this.props.locale || 'en'; }

  public static reconstruct(props: OrderProps): OrderEntity {
    return new OrderEntity(props);
  }

  public static createFromCart(params: {
    tenantId: string;
    cartSnapshot: {
      sessionId: string;
      items: any[];
    };
    orderNumber: string;
    orderToken: string;
    tableRef?: string | null;
    tableId?: string | null;
    qrContextId?: string | null;
    notes?: string;
    userId?: string | null;
    tenantCustomerId?: string | null;
    locale?: string;
  }): OrderEntity {
    if (!params.cartSnapshot.items || params.cartSnapshot.items.length === 0) {
      throw new EmptyOrderError();
    }

    const items = params.cartSnapshot.items.map(item => OrderItemVO.create({
      menuItemId: item.menuItemId,
      itemName: item.itemName,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      variantSnapshot: item.variantSnapshot,
      optionsSnapshot: item.optionsSnapshot,
      notes: item.notes,
    }));

    const order = new OrderEntity({
      id: randomUUID(),
      tenantId: params.tenantId,
      sessionId: params.cartSnapshot.sessionId,
      orderNumber: params.orderNumber,
      orderToken: params.orderToken,
      status: 'SUBMITTED',
      serviceModel: 'DINE_IN_TABLE',
      payTiming: 'PAY_AFTER',
      source: 'STOREFRONT_QR',
      tableRef: params.tableRef,
      tableId: params.tableId,
      qrContextId: params.qrContextId,
      items,
      subtotalCents: 0,
      discountCents: 0,
      taxCents: 0,
      serviceChargeCents: 0,
      totalCents: 0,
      notes: params.notes,
      userId: params.userId,
      tenantCustomerId: params.tenantCustomerId,
      locale: params.locale || 'en',
      submittedAt: new Date(),
    });

    order.computeTotals();
    return order;
  }

  public static createFromCounter(params: {
    tenantId: string;
    sessionId?: string;
    tableId?: string;
    tableRef?: string;
    items: OrderItemVO[];
    orderNumber: string;
    orderToken: string;
    notes?: string;
    createdById: string;
    locale?: string;
  }): OrderEntity {
    if (!params.items || params.items.length === 0) {
      throw new EmptyOrderError();
    }

    const order = new OrderEntity({
      id: randomUUID(),
      tenantId: params.tenantId,
      sessionId: params.sessionId,
      tableId: params.tableId,
      orderNumber: params.orderNumber,
      orderToken: params.orderToken,
      status: 'SUBMITTED',
      serviceModel: params.tableId ? 'DINE_IN_TABLE' : 'STALL_KIOSK',
      payTiming: 'PAY_AFTER',
      source: 'MERCHANT_MANUAL',
      tableRef: params.tableRef,
      items: params.items,
      subtotalCents: 0,
      discountCents: 0,
      taxCents: 0,
      serviceChargeCents: 0,
      totalCents: 0,
      notes: params.notes,
      createdById: params.createdById,
      locale: params.locale || 'en',
      submittedAt: new Date(),
    });

    order.computeTotals();
    return order;
  }

  public computeTotals(): void {
    let subtotal = 0;
    for (const item of this.props.items) {
      subtotal += item.lineTotalCents;
    }
    this.props.subtotalCents = Math.floor(subtotal);
    this.props.totalCents = Math.floor(
      this.props.subtotalCents -
      this.props.discountCents +
      this.props.taxCents +
      this.props.serviceChargeCents
    );
  }

  public transitionTo(newStatus: OrderStatus, actorId?: string): void {
    const current = this.props.status;

    if (current === 'CANCELLED') {
      throw new OrderAlreadyCancelledError(this.id || this.props.orderNumber);
    }

    const validTransitions: Record<string, OrderStatus[]> = {
      'SUBMITTED': ['PREPARING', 'CANCELLED'],
      'PREPARING': ['READY', 'CANCELLED'],
      'READY': ['COMPLETED'],
      'COMPLETED': [],
    };

    if (!validTransitions[current] || !validTransitions[current].includes(newStatus)) {
      throw new InvalidOrderTransitionError(current, newStatus);
    }

    this.props.status = newStatus;

    const now = new Date();
    if (newStatus === 'PREPARING') this.props.preparingAt = now;
    if (newStatus === 'READY') this.props.readyAt = now;
    if (newStatus === 'COMPLETED') {
      this.props.completedAt = now;
      this.props.orderTokenExpiresAt = now;
    }
  }

  public cancel(reason?: OrderCancellationReason | null, actorId?: string): void {
    this.transitionTo('CANCELLED', actorId);
    this.props.cancellationReason = reason;
    this.props.cancelledById = actorId;
    this.props.cancelledAt = new Date();
  }

  public appendItems(newItems: any[]): void {
    if (!newItems || newItems.length === 0) return;

    const mappedItems = newItems.map(item => OrderItemVO.create({
      menuItemId: item.menuItemId,
      itemName: item.itemName,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      variantSnapshot: item.variantSnapshot,
      optionsSnapshot: item.optionsSnapshot,
      notes: item.notes,
      createdAt: new Date(),
      kitchenStatus: 'NEW',
    }));

    this.props.items.push(...mappedItems);
    this.computeTotals();
  }

  public acknowledgeNewItems(): void {
    for (const item of this.props.items) {
      item.acknowledge();
    }
  }

  public isItemNew(item: OrderItemVO): boolean {
    return item.kitchenStatus === 'NEW';
  }

  public linkCustomer(userId: string, tenantCustomerId: string): void {
    this.props.userId = userId;
    this.props.tenantCustomerId = tenantCustomerId;
  }
}
