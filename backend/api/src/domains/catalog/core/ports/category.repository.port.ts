import { MenuCategory } from "../entities/menu-category.entity";

export interface ICategoryRepository {
    save(category: MenuCategory): Promise<void>;
    findById(tenantId: string, id: string): Promise<MenuCategory | null>;
    findMany(tenantId: string): Promise<MenuCategory[]>;
    delete(tenantId: string, id: string): Promise<void>;
}

export const CATEGORY_REPOSITORY = Symbol('ICATEGORY_REPOSITORY');   