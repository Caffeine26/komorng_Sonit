import { OrderNotFoundError } from '../../core/errors/order.errors';
import { IOrderRepository } from '../../core/ports/order.repository.port';
import { ITenantRepository } from '../../../tenant/core/ports/tenant.repository.port';
import { GetTenantSettingsUseCase } from '../../../tenant/application/use-cases/get-tenant-settings.use-case';
import { StorefrontOrderStatusResponse } from '@xfos/contracts-bff-storefront';
export class GetOrderStatusUseCase {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly tenantRepository: ITenantRepository,
    private readonly getTenantSettingsUseCase: GetTenantSettingsUseCase,
  ) {}

  async execute(token: string): Promise<StorefrontOrderStatusResponse> {
    const order = await this.orderRepository.findByToken(token);
    if (!order) {
      throw new OrderNotFoundError(token);
    }

    const tenant = await this.tenantRepository.findById(order.tenantId);
    if (!tenant) {
      throw new OrderNotFoundError(order.tenantId);
    }

    const settings = await this.getTenantSettingsUseCase.execute(tenant.id);

    let allItems = order.items;
    let totalCents = order.totalCents;
    let status = order.status;

    return {
      orderId: order.id as string,
      orderNumber: order.orderNumber,
      token: order.orderToken,
      status: status as any,
      tableRef: order.tableRef || order.tableId || null,
      totalCents,
      currency: (settings.settings?.currency as string) || 'USD',
      createdAt: order.createdAt!.toISOString(),
      submittedAt: order.submittedAt?.toISOString() ?? null,
      preparingAt: (order as any).preparingAt ? new Date((order as any).preparingAt).toISOString() : null,
      readyAt: (order as any).readyAt ? new Date((order as any).readyAt).toISOString() : null,
      completedAt: (order as any).completedAt ? new Date((order as any).completedAt).toISOString() : null,
      version: (order as any).version ?? 1,
      customerName: (order as any).customerName ?? null,
      items: allItems.map(item => ({
        menuItemId: item.menuItemId,
        name: {
          en: item.itemName,
          km: item.itemName,
        },
        quantity: item.quantity,
        priceCents: item.unitPriceCents,
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
      })),
      tenant: {
        name: tenant.nameEn,
        slug: tenant.slug,
        logoUrl: settings.settings?.logoUrl || null,
        codePrefix: tenant.codePrefix,
      },
    };
  }
}
