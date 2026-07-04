import { NotFoundError } from '../../../../../shared/errors/domain-error';
import { Injectable, Inject } from '@nestjs/common';
import { MENU_ITEM_REPOSITORY_PORT, IMenuItemRepository } from '../../../core/ports/menu-item.repository.port';
import { AdminUpdateMenuItemOptionInput } from '@xfos/contracts-bff-admin';
import { MenuItemOptionProps } from '../../../core/entities/menu-item.entity';

@Injectable()
export class UpdateOptionUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY_PORT)
    private readonly itemRepository: IMenuItemRepository,
  ) {}

  async execute(tenantId: string, menuItemId: string, groupId: string, optionId: string, input: AdminUpdateMenuItemOptionInput): Promise<MenuItemOptionProps> {
    const item = await this.itemRepository.findById(tenantId, menuItemId);
    if (!item) {
      throw new NotFoundError(`Menu item ${menuItemId} not found`);
    }

    item.updateOption(groupId, optionId, input);
    await this.itemRepository.save(item);

    const snapshot = item.toSnapshot();
    const group = snapshot.optionGroups.find(og => og.id === groupId);
    const updatedOption = group?.options.find(o => o.id === optionId);
    if (!updatedOption) throw new Error('Option not found after update');

    return updatedOption;
  }
}
