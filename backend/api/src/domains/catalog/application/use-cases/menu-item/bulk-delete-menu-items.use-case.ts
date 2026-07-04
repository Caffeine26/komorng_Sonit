import { Injectable, Inject } from '@nestjs/common';
import { MENU_ITEM_REPOSITORY_PORT, IMenuItemRepository } from '../../../core/ports/menu-item.repository.port';

@Injectable()
export class BulkDeleteMenuItemsUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY_PORT)
    private readonly itemRepository: IMenuItemRepository,
  ) {}

  async execute(tenantId: string, ids: string[]): Promise<{ count: number }> {
    let count = 0;
    for (const id of ids) {
      const item = await this.itemRepository.findById(tenantId, id);
      if (item) {
        await this.itemRepository.delete(tenantId, id);
        count++;
      }
    }
    return { count };
  }
}
