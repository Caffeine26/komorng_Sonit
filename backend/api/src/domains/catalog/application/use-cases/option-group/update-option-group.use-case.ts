import { NotFoundError } from '../../../../../shared/errors/domain-error';
import { Injectable, Inject } from '@nestjs/common';
import { MENU_ITEM_REPOSITORY_PORT, IMenuItemRepository } from '../../../core/ports/menu-item.repository.port';
import { AdminUpdateMenuItemOptionGroupInput } from '@xfos/contracts-bff-admin';
import { MenuItemOptionGroupProps } from '../../../core/entities/menu-item.entity';

@Injectable()
export class UpdateOptionGroupUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY_PORT)
    private readonly itemRepository: IMenuItemRepository,
  ) {}

  async execute(tenantId: string, menuItemId: string, groupId: string, input: AdminUpdateMenuItemOptionGroupInput): Promise<MenuItemOptionGroupProps> {
    const item = await this.itemRepository.findById(tenantId, menuItemId);
    if (!item) {
      throw new NotFoundError(`Menu item ${menuItemId} not found`);
    }

    item.updateOptionGroup(groupId, input);
    await this.itemRepository.save(item);

    const snapshot = item.toSnapshot();
    const updatedGroup = snapshot.optionGroups.find(og => og.id === groupId);
    if (!updatedGroup) throw new Error('Option group not found after update');

    return updatedGroup;
  }
}
