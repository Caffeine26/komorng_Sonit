import { NotFoundError } from '../../../../../shared/errors/domain-error';
import { Injectable, Inject } from '@nestjs/common';
import { MENU_ITEM_REPOSITORY_PORT, IMenuItemRepository } from '../../../core/ports/menu-item.repository.port';
import { AdminCreateMenuItemOptionGroupInput } from '@xfos/contracts-bff-admin';
import { MenuItemOptionGroupProps } from '../../../core/entities/menu-item.entity';

@Injectable()
export class CreateOptionGroupUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY_PORT)
    private readonly itemRepository: IMenuItemRepository,
  ) {}

  async execute(tenantId: string, menuItemId: string, input: AdminCreateMenuItemOptionGroupInput): Promise<MenuItemOptionGroupProps> {
    const item = await this.itemRepository.findById(tenantId, menuItemId);
    if (!item) {
      throw new NotFoundError(`Menu item ${menuItemId} not found`);
    }

    const newGroupId = `og_${Math.random().toString(36).substring(2, 12)}`;

    const group: MenuItemOptionGroupProps = {
      id: newGroupId,
      nameKm: input.nameKm,
      nameEn: input.nameEn || null,
      minSelect: input.minSelect,
      maxSelect: input.maxSelect,
      sortOrder: input.sortOrder ?? 0,
      options: [],
    };

    item.addOptionGroup(group);
    await this.itemRepository.save(item);

    const snapshot = item.toSnapshot();
    const savedGroup = snapshot.optionGroups.find(og => og.id === newGroupId);
    if (!savedGroup) throw new Error('Failed to create option group');

    return savedGroup;
  }
}
