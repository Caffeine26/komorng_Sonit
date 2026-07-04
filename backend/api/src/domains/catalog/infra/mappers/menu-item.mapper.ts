import { 
  MenuItem as PrismaMenuItem,
  MenuItemImage as PrismaImage,
  MenuItemVariant as PrismaVariant,
  MenuItemOptionGroup as PrismaOptionGroup,
  MenuItemOption as PrismaOption
} from '@xfos/database';
import { MenuItem, MenuItemProps } from '../../core/entities/menu-item.entity';

// Type for the full raw product from Prisma with all relations
export type RawMenuItem = PrismaMenuItem & {
  images: PrismaImage[];
  variants: PrismaVariant[];
  optionGroups: (PrismaOptionGroup & {
    options: PrismaOption[];
  })[];
};

export class MenuItemMapper {
  static toDomain(raw: RawMenuItem): MenuItem {
    return MenuItem.create({
      id: raw.id,
      tenantId: raw.tenantId,
      categoryId: raw.categoryId,
      nameKm: raw.nameKm,
      nameEn: raw.nameEn,
      descriptionKm: raw.descriptionKm,
      descriptionEn: raw.descriptionEn,
      basePriceCents: raw.basePriceCents,
      costCents: raw.costCents,
      unit: raw.unit,
      sku: raw.sku,
      isAvailable: raw.isAvailable,
      isVisible: raw.isVisible,
      sortOrder: raw.sortOrder,
      
      images: raw.images.map(img => ({
        id: img.id,
        imageUrl: img.imageUrl,
        isPrimary: img.isPrimary,
        sortOrder: img.sortOrder
      })),
      
      variants: raw.variants.map(v => ({
        id: v.id,
        nameKm: v.nameKm,
        nameEn: v.nameEn,
        attributeNameEn: v.attributeNameEn,
        attributeNameKm: v.attributeNameKm,
        priceCents: v.priceCents,
        sku: v.sku,
        costCents: v.costCents,
        isAvailable: v.isAvailable,
        isDefault: v.isDefault,
        sortOrder: v.sortOrder
      })),
      
      optionGroups: raw.optionGroups.map(og => ({
        id: og.id,
        nameKm: og.nameKm,
        nameEn: og.nameEn,
        minSelect: og.minSelect,
        maxSelect: og.maxSelect,
        sortOrder: og.sortOrder,
        options: og.options.map(o => ({
          id: o.id,
          nameKm: o.nameKm,
          nameEn: o.nameEn,
          imageUrl: o.imageUrl,
          priceDeltaCents: o.priceDeltaCents,
          isAvailable: o.isAvailable,
          sortOrder: o.sortOrder
        }))
      }))
    });
  }

  static toPersistence(item: MenuItem) {
    const props = item.toSnapshot();
    return {
      // id: props.id, // Primary key should not be in the data object for upsert update
      tenantId: props.tenantId,
      categoryId: props.categoryId,
      nameKm: props.nameKm,
      nameEn: props.nameEn,
      descriptionKm: props.descriptionKm,
      descriptionEn: props.descriptionEn,
      basePriceCents: props.basePriceCents,
      costCents: props.costCents,
      unit: props.unit,
      sku: props.sku,
      isAvailable: props.isAvailable,
      isVisible: props.isVisible,
      sortOrder: props.sortOrder,
    };
  }
}
