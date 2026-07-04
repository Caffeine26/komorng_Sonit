import { Injectable } from '@nestjs/common';
import type { AdminMenuOverviewResponse } from '@xfos/contracts-bff-admin';

/**
 * BFF use case — return the merchant menu overview. Will inject CatalogModule's
 * ListMenuQuery and project each MenuItem entity into the merchant-portal
 * shape with cost, margin, translation completeness.
 *
 * STUB until the catalog domain module exists.
 */
@Injectable()
export class GetMenuOverviewUseCase {
  async execute(): Promise<AdminMenuOverviewResponse> {
    return {
      categories: [],
      totalItems: 0,
      totalAvailable: 0,
      translationCompletenessPct: 0,
    };
  }
}
