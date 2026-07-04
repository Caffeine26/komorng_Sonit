import { Injectable, Inject } from '@nestjs/common';
import type { StorefrontContextResponse } from '@xfos/contracts-bff-storefront';
import { GetTenantSettingsUseCase } from '../../../../domains/tenant/application/use-cases/get-tenant-settings.use-case';
import { ListCategoriesUseCase } from '../../../../domains/catalog/application/use-cases/category/list-categories.use-case';
import { ListMenuItemsUseCase } from '../../../../domains/catalog/application/use-cases/menu-item/list-menu-items.use-case';
import { TENANT_REPOSITORY_PORT, ITenantRepository } from '../../../../domains/tenant/core/ports/tenant.repository.port';

@Injectable()
export class GetStorefrontContextUseCase {
  constructor(
    private readonly getTenantSettingsUseCase: GetTenantSettingsUseCase,
    private readonly listCategoriesUseCase: ListCategoriesUseCase,
    private readonly listMenuItemsUseCase: ListMenuItemsUseCase,
    @Inject(TENANT_REPOSITORY_PORT)
    private readonly tenantRepo: ITenantRepository,
  ) {}

  async execute(input: { slug: string }): Promise<StorefrontContextResponse | null> {
    const tenant = await this.tenantRepo.findBySlug(input.slug);
    if (!tenant) return null;

    const [tenantSettings, categories] = await Promise.all([
      this.getTenantSettingsUseCase.execute(tenant.id),
      this.listCategoriesUseCase.execute(tenant.id)
    ]);

    // Fetch items for each category, filtering for active categories and visible items
    const categoriesWithItems = await Promise.all(
      categories
        .filter(cat => cat.props.isActive)
        .map(async (cat) => {
          const items = await this.listMenuItemsUseCase.execute(tenant.id, cat.id);
          const visibleItems = items.filter(item => item.isVisible);
        
        return {
          id: cat.id,
          name: { 
            en: cat.props.nameEn, 
            km: cat.props.nameKm 
          },
          // Note: imageUrl is not in the contract yet, but we'll add it
          imageUrl: cat.props.urlBanner || (cat.props.icon ? `/icons/${cat.props.icon}.png` : null),
          items: visibleItems.map(item => ({
            id: item.id,
            name: { 
              en: item.nameEn || '', 
              km: item.nameKm 
            },
            description: item.descriptionKm || item.descriptionEn ? { 
              en: item.descriptionEn || null, 
              km: item.descriptionKm || null 
            } : null,
            priceCents: item.basePriceCents || 0,
            currency: 'USD', // Defaulting to USD for now as per contract
            imageUrl: item.images?.[0]?.imageUrl || null,
            images: item.images?.map(img => img.imageUrl).filter(Boolean) || [],
            available: item.isAvailable,
            variants: item.variants.map(v => ({
              id: v.id,
              nameEn: v.nameEn || '',
              nameKm: v.nameKm,
              attributeNameEn: v.attributeNameEn,
              attributeNameKm: v.attributeNameKm,
              priceCents: v.priceCents,
              sku: v.sku,
              isAvailable: v.isAvailable,
              isDefault: v.isDefault,
              sortOrder: v.sortOrder,
            })),
            optionGroups: item.optionGroups.map(og => ({
              id: og.id,
              nameEn: og.nameEn || '',
              nameKm: og.nameKm,
              minSelect: og.minSelect,
              maxSelect: og.maxSelect,
              sortOrder: og.sortOrder,
              options: og.options?.map(opt => ({
                id: opt.id,
                nameEn: opt.nameEn || '',
                nameKm: opt.nameKm,
                priceDeltaCents: opt.priceDeltaCents,
                imageUrl: opt.imageUrl || null,
                isAvailable: opt.isAvailable,
                sortOrder: opt.sortOrder,
              })) || [],
            })),
          })),
        };
      })
    );

    return {
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: {
          en: tenant.nameEn,
          km: tenant.nameKm,
        },
        logoUrl: tenantSettings.settings?.logoUrl || null,
        currency: (tenantSettings.settings?.currency as any) || 'USD',
        defaultLocale: (tenantSettings.settings?.defaultLocale as any) || 'km',
        codePrefix: tenant.codePrefix,
      },
      menu: {
        categories: categoriesWithItems,
      },
    };
  }
}
