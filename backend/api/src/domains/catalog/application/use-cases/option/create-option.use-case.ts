import { NotFoundError } from '../../../../../shared/errors/domain-error';
import { Injectable, Inject } from '@nestjs/common';
import { MENU_ITEM_REPOSITORY_PORT, IMenuItemRepository } from '../../../core/ports/menu-item.repository.port';
import { AdminCreateMenuItemOptionInput } from '@xfos/contracts-bff-admin';
import { MenuItemOptionProps } from '../../../core/entities/menu-item.entity';

@Injectable()
export class CreateOptionUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY_PORT)
    private readonly itemRepository: IMenuItemRepository,
  ) {}

  async execute(tenantId: string, menuItemId: string, groupId: string, input: AdminCreateMenuItemOptionInput): Promise<MenuItemOptionProps> {
    const item = await this.itemRepository.findById(tenantId, menuItemId);
    if (!item) {
      throw new NotFoundError(`Menu item ${menuItemId} not found`);
    }

    const newOptionId = `opt_${Math.random().toString(36).substring(2, 12)}`;

    const option: MenuItemOptionProps = {
      id: newOptionId,
      nameKm: input.nameKm,
      nameEn: input.nameEn || null,
      imageUrl: input.imageUrl || null,
      priceDeltaCents: input.priceDeltaCents ?? 0,
      isAvailable: input.isAvailable ?? true,
      sortOrder: input.sortOrder ?? 0,
    };

    item.addOption(groupId, option);
    await this.itemRepository.save(item);

    const snapshot = item.toSnapshot();
    const group = snapshot.optionGroups.find(og => og.id === groupId);
    const savedOption = group?.options.find(o => o.id === newOptionId);
    if (!savedOption) throw new Error('Failed to create option');

    return savedOption;
  }
}
