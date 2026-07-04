import { Injectable, Inject } from '@nestjs/common';
import { OrderNotFoundError } from '../../core/errors/order.errors';
import { ORDER_REPOSITORY_PORT, IOrderRepository } from '../../core/ports/order.repository.port';
import { AUTH_ONBOARDING_REPOSITORY_PORT, IAuthOnboardingRepository } from '../../../auth/core/ports/auth-onboarding.repository.port';
import { TENANT_CUSTOMER_REPOSITORY_PORT, ITenantCustomerRepository } from '../../../tenant/core/ports/tenant-customer.repository.port';
import { randomUUID } from 'node:crypto';
import { OrderEntity } from '../../core/entities/order.entity';
import { TenantCustomerEntity } from '../../../tenant/core/entities/tenant-customer.entity';

@Injectable()
export class LinkTelegramGuestToOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY_PORT)
    private readonly orderRepo: IOrderRepository,
    @Inject(AUTH_ONBOARDING_REPOSITORY_PORT)
    private readonly authOnboardingRepo: IAuthOnboardingRepository,
    @Inject(TENANT_CUSTOMER_REPOSITORY_PORT)
    private readonly tenantCustomerRepo: ITenantCustomerRepository,
  ) { }

  async execute(
    orderToken: string,
    chatId: string,
    username: string,
    fullName: string,
    avatarUrl: string | null
  ): Promise<OrderEntity> {
    // 1. Find Order
    const order = await this.orderRepo.findByToken(orderToken);
    if (!order) {
      throw new OrderNotFoundError(orderToken);
    }

    // 2. Register or update bot user mapping
    let provider = await this.authOnboardingRepo.findTelegramProvider(chatId);
    if (!provider) {
      provider = await this.authOnboardingRepo.findTelegramProviderByUsername(username);
    }

    let userId = provider?.userId;

    if (!provider) {
      userId = randomUUID();
      await this.authOnboardingRepo.registerBotUserAtomically(
        userId, fullName || 'Telegram Guest', null, avatarUrl, chatId, username || fullName
      );
    } else if (userId) {
      const updates: any = {};
      if (provider.displayName !== username) updates.displayName = username;
      if (avatarUrl && provider.avatarUrl !== avatarUrl) updates.avatarUrl = avatarUrl;

      const userUpdates: any = {};
      if (fullName) userUpdates.fullName = fullName;
      if (avatarUrl) userUpdates.avatarUrl = avatarUrl;

      if (Object.keys(updates).length > 0 || Object.keys(userUpdates).length > 0) {
        await this.authOnboardingRepo.updateUserAndProvider(userId, userUpdates, updates);
      }
    }

    // 3. Link Order
    if (!order.userId && userId) {
      // Find or create TenantCustomer
      let tenantCustomer = await this.tenantCustomerRepo.findByTenantAndUserId(order.tenantId, userId);
      if (!tenantCustomer) {
        tenantCustomer = TenantCustomerEntity.create({
          tenantId: order.tenantId,
          id: randomUUID(),
          userId: userId,
        });
        await this.tenantCustomerRepo.upsert(tenantCustomer);
      }

      order.linkCustomer(userId, tenantCustomer.id);
      await this.orderRepo.update(order);
    }

    return order;
  }
}
