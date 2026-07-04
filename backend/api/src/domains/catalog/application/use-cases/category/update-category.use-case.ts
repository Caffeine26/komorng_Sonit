import { NotFoundError } from '../../../../../shared/errors/domain-error';
import { Injectable, Inject } from '@nestjs/common';
import { CATEGORY_REPOSITORY, ICategoryRepository } from '../../../core/ports/category.repository.port';
import { MenuCategory } from '../../../core/entities/menu-category.entity';
import { AdminUpdateCategoryInput } from '@xfos/contracts-bff-admin';

@Injectable()
export class UpdateCategoryUseCase {
    constructor(
        @Inject(CATEGORY_REPOSITORY)
        private readonly categoryRepository: ICategoryRepository,
    ) { }

    async execute(tenantId: string, id: string, input: AdminUpdateCategoryInput): Promise<MenuCategory> {
        // 1. Find the existing category
        // Note: We MUST pass tenantId to ensure one merchant can't update another's category!
        const category = await this.categoryRepository.findById(tenantId, id);

        if (!category) {
            throw new NotFoundError(`Category ${id} not found`);
        }

        // 2. Use the Domain Entity to apply updates
        // This handles logic like updating the 'updatedAt' timestamp
        category.update({
            nameKm: input.nameKm,
            nameEn: input.nameEn,
            sortOrder: input.sortOrder,
            isActive: input.isActive, // This handles your Active/Inactive toggle
            icon: input.icon,
            urlBanner: input.urlBanner,
        });

        // 3. Persist the changes to the database
        await this.categoryRepository.save(category);

        return category;
    }
}
