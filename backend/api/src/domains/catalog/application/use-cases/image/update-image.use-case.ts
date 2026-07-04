import { NotFoundError } from '../../../../../shared/errors/domain-error';
import { Injectable, Inject } from '@nestjs/common';
import { MENU_ITEM_REPOSITORY_PORT, IMenuItemRepository } from '../../../core/ports/menu-item.repository.port';
import { AdminUpdateMenuItemImageInput } from '@xfos/contracts-bff-admin';
import { MenuItemImageProps } from '../../../core/entities/menu-item.entity';

@Injectable()
export class UpdateImageUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY_PORT)
    private readonly itemRepository: IMenuItemRepository,
  ) {}

  async execute(tenantId: string, menuItemId: string, imageId: string, input: AdminUpdateMenuItemImageInput): Promise<MenuItemImageProps> {
    const item = await this.itemRepository.findById(tenantId, menuItemId);
    if (!item) {
      throw new NotFoundError(`Menu item ${menuItemId} not found`);
    }

    item.updateImage(imageId, input);
    await this.itemRepository.save(item);

    const snapshot = item.toSnapshot();
    const updatedImage = snapshot.images.find(img => img.id === imageId);
    if (!updatedImage) throw new Error('Image not found after update');

    return updatedImage;
  }
}
