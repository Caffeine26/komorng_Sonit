import { MenuCategory as PrismaMenuCategory } from '@xfos/database';
import { MenuCategory } from '../../core/entities/menu-category.entity';

export function toDomain(raw: PrismaMenuCategory & { _count?: { items: number } }): MenuCategory {
    return MenuCategory.reconstitute({
        id: raw.id,
        tenantId: raw.tenantId,
        nameKm: raw.nameKm,
        nameEn: raw.nameEn,
        sortOrder: raw.sortOrder,
        isActive: raw.isActive,
        icon: raw.icon,
        urlBanner: raw.urlBanner,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        deletedAt: raw.deletedAt,
        _count: raw._count ? { items: raw._count.items } : null
    });
}

// We omit createdAt and updatedAt because Prisma handles those automatically
export function toPersistence(entity: MenuCategory): Omit<PrismaMenuCategory, 'createdAt' | 'updatedAt'> {
    return {
        id: entity.props.id,
        tenantId: entity.props.tenantId,
        nameKm: entity.props.nameKm,
        nameEn: entity.props.nameEn,
        sortOrder: entity.props.sortOrder,
        isActive: entity.props.isActive,
        icon: entity.props.icon ?? null,
        urlBanner: entity.props.urlBanner ?? null,
        deletedAt: entity.props.deletedAt ?? null,
    };
}
