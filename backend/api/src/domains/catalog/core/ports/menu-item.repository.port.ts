import { MenuItem } from '../entities/menu-item.entity';

export const MENU_ITEM_REPOSITORY_PORT = Symbol('MENU_ITEM_REPOSITORY_PORT');

export interface IMenuItemRepository {
  /**
   * Saves a menu item along with all its related entities 
   * (Images, Variants, OptionGroups, and Options) in a single transaction.
   */
  save(item: MenuItem): Promise<void>;
  
  findById(tenantId: string, id: string): Promise<MenuItem | null>;
  
  findByCategory(tenantId: string, categoryId: string): Promise<MenuItem[]>;
  
  findAll(tenantId: string): Promise<MenuItem[]>;
  
  delete(tenantId: string, id: string): Promise<void>;
}
