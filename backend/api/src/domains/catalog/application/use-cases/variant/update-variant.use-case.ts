import { NotFoundError } from '../../../../../shared/errors/domain-error';
import { Injectable, Inject } from '@nestjs/common';
import { MENU_ITEM_REPOSITORY_PORT, IMenuItemRepository } from '../../../core/ports/menu-item.repository.port';
import { AdminUpdateMenuItemVariantInput } from '@xfos/contracts-bff-admin';
import { MenuItemVariantProps } from '../../../core/entities/menu-item.entity';

@Injectable()
export class UpdateVariantUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY_PORT)
    private readonly itemRepository: IMenuItemRepository,
  ) {}

  async execute(tenantId: string, menuItemId: string, variantId: string, input: AdminUpdateMenuItemVariantInput): Promise<MenuItemVariantProps> {
    const item = await this.itemRepository.findById(tenantId, menuItemId);
    if (!item) {
      throw new NotFoundError(`Menu item ${menuItemId} not found`);
    }

    item.updateVariant(variantId, input);
    await this.itemRepository.save(item);

    const snapshot = item.toSnapshot();
    const updatedVariant = snapshot.variants.find(v => v.id === variantId);
    if (!updatedVariant) throw new Error('Variant not found after update');

    return updatedVariant;
  }
}
