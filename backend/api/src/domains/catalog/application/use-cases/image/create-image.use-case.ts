import { NotFoundError } from '../../../../../shared/errors/domain-error';
import { Injectable, Inject } from '@nestjs/common';
import { MENU_ITEM_REPOSITORY_PORT, IMenuItemRepository } from '../../../core/ports/menu-item.repository.port';
import { AdminCreateMenuItemImageInput } from '@xfos/contracts-bff-admin';
import { MenuItemImageProps } from '../../../core/entities/menu-item.entity';

@Injectable()
export class CreateImageUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY_PORT)
    private readonly itemRepository: IMenuItemRepository,
  ) {}

  async execute(tenantId: string, menuItemId: string, input: AdminCreateMenuItemImageInput): Promise<MenuItemImageProps> {
    const item = await this.itemRepository.findById(tenantId, menuItemId);
    if (!item) {
      throw new NotFoundError(`Menu item ${menuItemId} not found`);
    }

    const newImageId = `img_${Math.random().toString(36).substring(2, 12)}`;

    const image: MenuItemImageProps = {
      id: newImageId,
      imageUrl: input.imageUrl,
      isPrimary: input.isPrimary ?? false,
      sortOrder: input.sortOrder ?? 0,
    };

    item.addImage(image);
    await this.itemRepository.save(item);

    const snapshot = item.toSnapshot();
    const savedImage = snapshot.images.find(img => img.id === newImageId);
    if (!savedImage) throw new Error('Failed to create image');

    return savedImage;
  }
}
