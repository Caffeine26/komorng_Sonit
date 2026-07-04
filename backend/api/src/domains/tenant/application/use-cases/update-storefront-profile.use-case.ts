import { Injectable, Inject } from '@nestjs/common';
import { ITenantCustomerRepository, TENANT_CUSTOMER_REPOSITORY_PORT } from '../../../tenant/core/ports/tenant-customer.repository.port';
import { TenantCustomerEntity } from '../../../tenant/core/entities/tenant-customer.entity';
import { UserRepositoryPort, USER_REPOSITORY_PORT } from '../../../auth/core/ports/user.repository.port';

export interface UpdateStorefrontProfileInput {
  tenantId: string;
  userId: string;
  phoneNumber?: string | null;
  dateOfBirth?: Date | null;
}

@Injectable()
export class UpdateStorefrontProfileUseCase {
  constructor(
    @Inject(TENANT_CUSTOMER_REPOSITORY_PORT)
    private readonly tenantCustomerRepo: ITenantCustomerRepository,
    @Inject(USER_REPOSITORY_PORT)
    private readonly userRepo: UserRepositoryPort,
  ) {}

  async execute(input: UpdateStorefrontProfileInput): Promise<void> {
    let customer = await this.tenantCustomerRepo.findByTenantAndUserId(input.tenantId, input.userId);
    
    if (!customer) {
      // Create if it doesn't exist
      customer = TenantCustomerEntity.create({
        tenantId: input.tenantId,
        id: crypto.randomUUID(),
        userId: input.userId,
      });
    }

    if (input.dateOfBirth !== undefined) {
      customer.dateOfBirth = input.dateOfBirth;
    }

    await this.tenantCustomerRepo.upsert(customer);

    if (input.phoneNumber !== undefined) {
      await this.userRepo.updatePhone(input.userId, input.phoneNumber);
    }
  }
}
