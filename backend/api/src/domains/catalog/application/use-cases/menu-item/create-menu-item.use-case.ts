import { Injectable, Inject } from '@nestjs/common';
import { MENU_ITEM_REPOSITORY_PORT, IMenuItemRepository } from '../../../core/ports/menu-item.repository.port';
import { MenuItem } from '../../../core/entities/menu-item.entity';
import { AdminCreateMenuItemInput } from '@xfos/contracts-bff-admin';

@Injectable()
export class CreateMenuItemUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY_PORT)
    private readonly itemRepository: IMenuItemRepository,
  ) {}

  async execute(tenantId: string, input: AdminCreateMenuItemInput): Promise<MenuItem> {
    const id = `item_${Math.random().toString(36).substring(2, 12)}`;

    const item = MenuItem.create({
      id,
      tenantId,
      categoryId: (input.categoryId === 'any' || !input.categoryId) ? null : input.categoryId,
      nameKm: input.nameKm,
      nameEn: input.nameEn || null,
      descriptionKm: input.descriptionKm || null,
      descriptionEn: input.descriptionEn || null,
      basePriceCents: input.basePriceCents || null,
      costCents: input.costCents || null,
      unit: input.unit || null,
      sku: input.sku || null,
      isAvailable: input.isAvailable ?? true,
      isVisible: input.isVisible ?? true,
      sortOrder: input.sortOrder ?? 0,
      
      images: input.images || [],
      variants: input.variants || [],
      optionGroups: input.optionGroups || [],
    });

    await this.itemRepository.save(item);

    return item;
  }
}
