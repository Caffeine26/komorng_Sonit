import { Injectable, Inject } from '@nestjs/common';
import { StorefrontProfileNotFoundError } from '../../core/errors/tenant.errors';
import { ITenantCustomerRepository, TENANT_CUSTOMER_REPOSITORY_PORT } from '../../../tenant/core/ports/tenant-customer.repository.port';
import { UserRepositoryPort, USER_REPOSITORY_PORT } from '../../../auth/core/ports/user.repository.port';

export interface GetStorefrontProfileInput {
  tenantId: string;
  userId: string;
}

export interface GetStorefrontProfileResult {
  phoneNumber: string | null;
  dateOfBirth: Date | null;
}

@Injectable()
export class GetStorefrontProfileUseCase {
  constructor(
    @Inject(TENANT_CUSTOMER_REPOSITORY_PORT)
    private readonly tenantCustomerRepo: ITenantCustomerRepository,
    @Inject(USER_REPOSITORY_PORT)
    private readonly userRepo: UserRepositoryPort,
  ) {}

  async execute(input: GetStorefrontProfileInput): Promise<GetStorefrontProfileResult> {
    const [customer, user] = await Promise.all([
      this.tenantCustomerRepo.findByTenantAndUserId(input.tenantId, input.userId),
      this.userRepo.findById(input.userId),
    ]);
    
    return {
      phoneNumber: user?.phone || null,
      dateOfBirth: customer?.dateOfBirth || null,
    };
  }
}
