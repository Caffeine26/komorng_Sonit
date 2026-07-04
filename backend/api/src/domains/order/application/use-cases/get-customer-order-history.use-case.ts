import { Injectable, Inject } from '@nestjs/common';
import { IOrderRepository, ORDER_REPOSITORY_PORT } from '../../core/ports/order.repository.port';
import { StorefrontOrderHistoryResponse } from '@xfos/contracts-bff-storefront';
import { ITenantCustomerRepository, TENANT_CUSTOMER_REPOSITORY_PORT } from '../../../tenant/core/ports/tenant-customer.repository.port';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

export interface GetCustomerOrderHistoryInput {
  tenantId: string;
  userId?: string | null;
  sessionId?: string | null;
}

@Injectable()
export class GetCustomerOrderHistoryUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY_PORT)
    private readonly orderRepository: IOrderRepository,
    @Inject(TENANT_CUSTOMER_REPOSITORY_PORT)
    private readonly tenantCustomerRepository: ITenantCustomerRepository,
    private readonly prisma: PrismaService,
  ) { }

  async execute(input: GetCustomerOrderHistoryInput): Promise<StorefrontOrderHistoryResponse> {
    let resolvedUserId: string | null = input.userId || null;
    let customerId: string | null = null;

    // ── Step 1: If no userId from JWT, resolve from the current session ─────────
    // Follows the phone/telegram_id identity chain:
    //   sessionId → any linked order with userId → that user's full history
    if (!resolvedUserId && input.sessionId) {
      const linked = await this.prisma.order.findFirst({
        where: { sessionId: input.sessionId, userId: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { userId: true, tenantCustomerId: true },
      });
      if (linked?.userId) {
        resolvedUserId = linked.userId;
        // Also grab tenantCustomerId directly to skip the next lookup
        if (linked.tenantCustomerId) {
          customerId = linked.tenantCustomerId;
        }
      }
    }

    // ── Step 2: Resolve tenantCustomerId from userId (if not already found) ──────
    if (resolvedUserId && !customerId) {
      const customer = await this.tenantCustomerRepository.findByTenantAndUserId(input.tenantId, resolvedUserId);
      if (customer) {
        customerId = customer.id;
      }
    }

    // ── Step 3: No identity at all — return empty list ───────────────────────────
    if (!customerId && !input.sessionId) {
      return [];
    }

    // ── Step 4: Fetch all orders by tenantCustomerId OR sessionId ────────────────
    // tenantCustomerId covers ALL sessions this customer ever had.
    // sessionId is a fallback for anonymous guests with no linked identity.
    const orders = await this.orderRepository.findByCustomerOrSession(input.tenantId, customerId, input.sessionId);

    return orders.map(order => ({
      orderId: order.id as string,
      orderNumber: order.orderNumber,
      token: order.orderToken,
      // SUBMITTED maps to NEW for the tracking contract
      status: (order.status === 'SUBMITTED' ? 'NEW' : order.status) as any,
      items: order.items.map(item => {
        // itemName is stored as the Khmer name at creation time
        const nameParts = (item.itemName || '').split(' / ');
        const nameKm = nameParts[0] || item.itemName;
        const nameEn = nameParts[1] || item.itemName;
        return {
          name: { km: nameKm, en: nameEn },
          quantity: item.quantity,
          priceCents: item.unitPriceCents,
          imageUrl: null,
          menuItemId: item.menuItemId,
          variantSnapshot: item.variantSnapshot,
          optionsSnapshot: item.optionsSnapshot,
          notes: item.notes,
        };
      }),
      totalCents: order.totalCents,
      currency: 'USD',
      createdAt: (order.createdAt || new Date()).toISOString(),
      updatedAt: (order.submittedAt || order.createdAt || new Date()).toISOString(),
    }));
  }
}
