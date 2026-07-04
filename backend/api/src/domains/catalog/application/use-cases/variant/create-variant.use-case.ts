import { NotFoundError } from '../../../../../shared/errors/domain-error';
import { Injectable, Inject } from '@nestjs/common';
import { MENU_ITEM_REPOSITORY_PORT, IMenuItemRepository } from '../../../core/ports/menu-item.repository.port';
import { AdminCreateMenuItemVariantInput } from '@xfos/contracts-bff-admin';
import { MenuItemVariantProps } from '../../../core/entities/menu-item.entity';

@Injectable()
export class CreateVariantUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY_PORT)
    private readonly itemRepository: IMenuItemRepository,
  ) {}

  async execute(tenantId: string, menuItemId: string, input: AdminCreateMenuItemVariantInput): Promise<MenuItemVariantProps> {
    const item = await this.itemRepository.findById(tenantId, menuItemId);
    if (!item) {
      throw new NotFoundError(`Menu item ${menuItemId} not found`);
    }

    const newVariantId = `var_${Math.random().toString(36).substring(2, 12)}`;

    const variant: MenuItemVariantProps = {
      id: newVariantId,
      nameKm: input.nameKm,
      nameEn: input.nameEn || null,
      attributeNameEn: input.attributeNameEn,
      attributeNameKm: input.attributeNameKm,
      priceCents: input.priceCents,
      costCents: input.costCents || null,
      sku: input.sku || null,
      isAvailable: input.isAvailable ?? true,
      isDefault: input.isDefault ?? false,
      sortOrder: input.sortOrder ?? 0,
    };

    item.addVariant(variant);
    await this.itemRepository.save(item);

    // After saving, find the variant from the snapshot to return it
    const snapshot = item.toSnapshot();
    const savedVariant = snapshot.variants.find(v => v.id === newVariantId);
    if (!savedVariant) throw new Error('Failed to create variant');

    return savedVariant;
  }
}
