import { NotFoundError } from '../../../../../shared/errors/domain-error';
import { Injectable, Inject } from '@nestjs/common';
import { MENU_ITEM_REPOSITORY_PORT, IMenuItemRepository } from '../../../core/ports/menu-item.repository.port';
import { MenuItem } from '../../../core/entities/menu-item.entity';
import { AdminUpdateMenuItemInput } from '@xfos/contracts-bff-admin';

@Injectable()
export class UpdateMenuItemUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY_PORT)
    private readonly itemRepository: IMenuItemRepository,
  ) {}

  async execute(tenantId: string, id: string, input: AdminUpdateMenuItemInput): Promise<MenuItem> {
    const existingItem = await this.itemRepository.findById(tenantId, id);
    if (!existingItem) {
      throw new NotFoundError(`Menu Item ${id} not found`);
    }

    // Explicitly handle fields that might be null/undefined in the input
    const snapshot = existingItem.toSnapshot();
    const updatedProps = {
      ...snapshot,
      ...input,
      id,
      tenantId,
      // Ensure categoryId can be cleared and 'any' is mapped to null
      categoryId: input.categoryId === 'any' ? null : (input.categoryId !== undefined ? input.categoryId : snapshot.categoryId),
    };

    const updatedItem = MenuItem.create(updatedProps as any);

    await this.itemRepository.save(updatedItem);

    return updatedItem;
  }
}
