import { TenantCustomerEntity } from '../entities/tenant-customer.entity';

export const TENANT_CUSTOMER_REPOSITORY_PORT = Symbol('TENANT_CUSTOMER_REPOSITORY_PORT');

export interface ITenantCustomerRepository {
  /**
   * Finds a specific customer profile within a tenant by its own ID.
   * @param tenantId The isolated tenant context
   * @param id The tenant customer identifier
   */
  findById(tenantId: string, id: string): Promise<TenantCustomerEntity | null>;

  /**
   * Finds a specific customer profile within a tenant.
   * @param tenantId The isolated tenant context
   * @param userId The global user identifier
   */
  findByTenantAndUserId(tenantId: string, userId: string): Promise<TenantCustomerEntity | null>;

  /**
   * Upserts the tenant customer profile.
   * Creates a new profile if they are visiting this tenant for the first time,
   * or updates their existing profile (e.g. updating lastVisitAt).
   * @param customer The tenant customer entity to save
   */
  upsert(customer: TenantCustomerEntity): Promise<TenantCustomerEntity>;

  /**
   * Retrieves all customers for a given tenant.
   * @param tenantId The isolated tenant context
   */
  findAllByTenant(tenantId: string): Promise<TenantCustomerEntity[]>;
}
