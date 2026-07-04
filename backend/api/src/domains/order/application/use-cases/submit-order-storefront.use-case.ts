import { Injectable, Inject } from '@nestjs/common';
import { UnauthorizedError } from '../../../../shared/errors/domain-error';
import { randomBytes } from 'crypto';
import { IOrderRepository, ORDER_REPOSITORY_PORT } from '../../core/ports/order.repository.port';
import { IOrderEventPublisher, ORDER_EVENT_PUBLISHER_PORT } from '../../core/ports/order-event-publisher.port';
import { IOrderSessionRepository, ORDER_SESSION_REPOSITORY_PORT } from '../../core/ports/order-session.repository.port';
import { OrderEntity } from '../../core/entities/order.entity';
import { CartNotFoundError, CartMismatchError, EmptyCartError, ReloadOrderFailedError } from '../../core/errors/order.errors';
import { ITenantCustomerRepository, TENANT_CUSTOMER_REPOSITORY_PORT } from '../../../tenant/core/ports/tenant-customer.repository.port';
import { SubmitOrderStorefrontOutput } from '@xfos/contracts-bff-storefront';
import { SendOrderSubmittedNotificationUseCase } from '../../../notification/application/use-cases/send-order-submitted-notification.use-case';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

export interface SubmitOrderStorefrontInput {
  tenantId: string;
  sessionId: string;
  cartId: string;
  tableRef?: string | null;
  tableId?: string | null;
  qrContextId?: string | null;
  notes?: string;
  userId?: string | null;
  locale?: string;
}

@Injectable()
export class SubmitOrderStorefrontUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY_PORT)
    private readonly orderRepository: IOrderRepository,
    @Inject(ORDER_EVENT_PUBLISHER_PORT)
    private readonly orderEventPublisher: IOrderEventPublisher,
    @Inject(ORDER_SESSION_REPOSITORY_PORT)
    private readonly orderSessionRepository: IOrderSessionRepository,
    @Inject(TENANT_CUSTOMER_REPOSITORY_PORT)
    private readonly tenantCustomerRepository: ITenantCustomerRepository,
    private readonly sendOrderSubmittedNotificationUseCase: SendOrderSubmittedNotificationUseCase,
    private readonly prisma: PrismaService,
  ) {}

  async execute(input: SubmitOrderStorefrontInput): Promise<SubmitOrderStorefrontOutput> {
    const cartSnapshot = await this.orderRepository.findCartBySessionId(input.tenantId, input.sessionId);

    if (!cartSnapshot) {
      throw new CartNotFoundError(input.cartId);
    }

    if (cartSnapshot.id !== input.cartId) {
      throw new CartMismatchError('Cart does not match the active session cart');
    }

    if (cartSnapshot.sessionId !== input.sessionId) {
      throw new UnauthorizedError('Cart does not belong to the current session');
    }

    if (!cartSnapshot.items.length) {
      throw new EmptyCartError();
    }

    let resolvedQrContextId = input.qrContextId ?? null;
    let resolvedTableId = input.tableId ?? null;
    let resolvedTableRef = input.tableRef ?? null;

    const session = await this.orderSessionRepository.findSessionById(input.tenantId, input.sessionId);

    if (session) {
      resolvedQrContextId = session.qrContextId ?? resolvedQrContextId;
      resolvedTableId = session.tableId ?? resolvedTableId;
      resolvedTableRef = session.tableRef ?? resolvedTableRef;

      if (!resolvedTableRef && session.qrContext?.table) {
        resolvedTableRef = session.qrContext.table.label;
      }
    }

    let resolvedTenantCustomerId: string | null = null;
    let resolvedUserId: string | null | undefined = input.userId;
    if (input.userId) {
      // Hard check: ensure user still exists in the DB (prevents foreign key crashes from stale tokens)
      const actualUser = await this.prisma.user.findUnique({ where: { id: input.userId } });
      
      if (!actualUser) {
        console.warn(`User ${input.userId} has a token but does not exist in the users table! Downgrading to anonymous order.`);
        resolvedUserId = null;
      } else {
        const customer = await this.tenantCustomerRepository.findByTenantAndUserId(input.tenantId, input.userId);
        if (customer) {
          resolvedTenantCustomerId = customer.id;
        }
      }
    } else {
      const previousOrder = await this.prisma.order.findFirst({
        where: { sessionId: input.sessionId, userId: { not: null } },
        orderBy: { createdAt: 'desc' }
      });
      if (previousOrder && previousOrder.userId) {
        resolvedUserId = previousOrder.userId;
        resolvedTenantCustomerId = previousOrder.tenantCustomerId;
      }
    }

    console.log(`Submitting order. Original userId: ${input.userId}, Resolved userId: ${resolvedUserId}`);

    const openOrder = await this.orderRepository.findOpenOrderBySessionId(
      input.tenantId,
      input.sessionId,
    );

    let order: OrderEntity;

    if (openOrder) {
      await this.orderRepository.appendCartToOrder(
        input.tenantId,
        openOrder.id as string,
        cartSnapshot,
        input.cartId,
      );
      const refreshed = await this.orderRepository.findById(
        input.tenantId,
        openOrder.id as string,
      );
      if (!refreshed) {
        throw new ReloadOrderFailedError();
      }
      order = refreshed;
    } else {
      const suffix = input.cartId.substring(0, 5).toUpperCase();
      const orderNumber = await this.orderRepository.allocateOrderNumber(input.tenantId, suffix);
      const orderToken = randomBytes(16).toString('hex');

      order = OrderEntity.createFromCart({
        tenantId: input.tenantId,
        cartSnapshot: {
          sessionId: input.sessionId,
          items: cartSnapshot.items,
        },
        orderNumber,
        orderToken,
        qrContextId: resolvedQrContextId,
        tableId: resolvedTableId,
        tableRef: resolvedTableRef,
        notes: input.notes,
        userId: resolvedUserId,
        tenantCustomerId: resolvedTenantCustomerId,
        locale: input.locale,
      });

      await this.orderRepository.save(order, input.cartId);
    }

    try {
      await this.orderEventPublisher.publishOrderSubmitted(order);
    } catch (err) {
      console.error(`Failed to publish OrderSubmitted event for order ${order.id}:`, err);
    }

    try {
      await this.sendOrderSubmittedNotificationUseCase.execute({ order });
    } catch (err) {
      console.error(`Failed to send order submitted notification for order ${order.id}:`, err);
    }

    return {
      orderId: order.id as string,
      orderNumber: order.orderNumber,
      orderToken: order.orderToken,
      status: order.status as 'SUBMITTED',
      totalCents: order.totalCents,
      estimatedReadyAt: order.estimatedReadyAt ? order.estimatedReadyAt.toISOString() : null,
      createdAt: (order.createdAt || new Date()).toISOString(),
    };
  }
}
