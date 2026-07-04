import { Tenant } from '../entities/tenant.entity';

export interface ITenantRepository {
  /**
   * Save or update a tenant.
   */
  save(tenant: Tenant): Promise<void>;

  /**
   * Find a tenant by its unique ID.
   */
  findById(id: string): Promise<Tenant | null>;

  /**
   * Find a tenant by its unique URL slug.
   */
  findBySlug(slug: string): Promise<Tenant | null>;

  /**
   * Assign a user as the owner of a tenant.
   */
  assignOwner(tenantId: string, userId: string): Promise<void>;

  /**
   * Check if a user is already an owner of any tenant.
   */
  existsByOwnerId(userId: string): Promise<boolean>;
}

/**
 * Dependency Injection Token
 */
export const TENANT_REPOSITORY_PORT = Symbol('ITenantRepository');
