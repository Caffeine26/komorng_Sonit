import { OrderEntity } from '../entities/order.entity';
import { Tenant } from '../../../tenant/core/entities/tenant.entity';

export const PDF_GENERATOR_SERVICE = Symbol('PDF_GENERATOR_SERVICE');

export interface IPdfGeneratorService {
  generateOrderReceipt(order: OrderEntity, tenant: Tenant, locale?: string): Promise<{ buffer: Buffer; orderNumber: string }>;
}
