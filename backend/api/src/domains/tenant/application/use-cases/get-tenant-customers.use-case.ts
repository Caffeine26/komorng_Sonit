import { Injectable, Inject } from '@nestjs/common';
import { ITenantCustomerRepository, TENANT_CUSTOMER_REPOSITORY_PORT } from '../../core/ports/tenant-customer.repository.port';
import { TenantCustomerEntity } from '../../core/entities/tenant-customer.entity';

export interface GetTenantCustomersInput {
  tenantId: string;
}

@Injectable()
export class GetTenantCustomersUseCase {
  constructor(
    @Inject(TENANT_CUSTOMER_REPOSITORY_PORT)
    private readonly tenantCustomerRepository: ITenantCustomerRepository,
  ) {}

  async execute(input: GetTenantCustomersInput): Promise<TenantCustomerEntity[]> {
    return this.tenantCustomerRepository.findAllByTenant(input.tenantId);
  }
}
