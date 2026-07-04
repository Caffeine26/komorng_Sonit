import { NotFoundError } from '../../../../shared/errors/domain-error';

export class TenantNotFoundError extends NotFoundError {
  constructor(tenantId: string) {
    super(`Tenant with ID ${tenantId} not found`);
    this.name = 'TenantNotFoundError';
  }
}

export class StorefrontProfileNotFoundError extends NotFoundError {
  constructor(tenantId: string) {
    super(`Storefront profile for tenant ${tenantId} not found`);
    this.name = 'StorefrontProfileNotFoundError';
  }
}
