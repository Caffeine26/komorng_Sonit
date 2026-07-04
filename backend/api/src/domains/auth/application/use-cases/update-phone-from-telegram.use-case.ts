import { Injectable, Inject } from '@nestjs/common';
import { UserNotFoundError } from '../../core/errors/auth.errors';
import { ITenantCustomerRepository, TENANT_CUSTOMER_REPOSITORY_PORT } from '../../../tenant/core/ports/tenant-customer.repository.port';
import { UserRepositoryPort, USER_REPOSITORY_PORT } from '../../core/ports/user.repository.port';

@Injectable()
export class UpdatePhoneFromTelegramUseCase {
  constructor(
    @Inject(USER_REPOSITORY_PORT)
    private readonly userRepo: UserRepositoryPort,
    @Inject(TENANT_CUSTOMER_REPOSITORY_PORT)
    private readonly tenantCustomerRepo: ITenantCustomerRepository,
  ) {}

  async execute(telegramId: string, phoneNumber: string): Promise<void> {
    // 1. Find the user by their Telegram ID
    const user = await this.userRepo.findByProviderId('TELEGRAM', telegramId);
    if (!user) {
      throw new UserNotFoundError(telegramId);
    }

    // 2. Update their global phone number
    await this.userRepo.updatePhone(user.id, phoneNumber);
  }
}
