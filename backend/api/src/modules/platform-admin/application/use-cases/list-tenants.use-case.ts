import { Injectable } from '@nestjs/common';
import type {
  ListTenantsRequest,
  ListTenantsResponse,
} from '@xfos/contracts-bff-platform-admin';

/**
 * BFF use case — cross-tenant list for internal ops. Joins tenant + billing
 * + last-activity into a single shape so the ops dashboard renders in one
 * fetch.
 *
 * STUB until TenantModule + BillingModule exist.
 */
@Injectable()
export class ListTenantsUseCase {
  async execute(_input: ListTenantsRequest): Promise<ListTenantsResponse> {
    return { tenants: [], total: 0 };
  }
}
