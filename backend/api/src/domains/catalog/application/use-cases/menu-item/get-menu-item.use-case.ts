import { NotFoundError } from '../../../../../shared/errors/domain-error';
import { Injectable, Inject } from '@nestjs/common';
import { MENU_ITEM_REPOSITORY_PORT, IMenuItemRepository } from '../../../core/ports/menu-item.repository.port';
import { MenuItem } from '../../../core/entities/menu-item.entity';

@Injectable()
export class GetMenuItemUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY_PORT)
    private readonly itemRepository: IMenuItemRepository,
  ) {}

  async execute(tenantId: string, id: string): Promise<MenuItem> {
    const item = await this.itemRepository.findById(tenantId, id);
    if (!item) {
      throw new NotFoundError(`Menu Item ${id} not found`);
    }
    return item;
  }
}
