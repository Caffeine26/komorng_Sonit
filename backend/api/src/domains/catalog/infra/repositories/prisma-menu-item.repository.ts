import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { IMenuItemRepository } from '../../core/ports/menu-item.repository.port';
import { MenuItem } from '../../core/entities/menu-item.entity';
import { MenuItemMapper, RawMenuItem } from '../mappers/menu-item.mapper';

@Injectable()
export class PrismaMenuItemRepository implements IMenuItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(item: MenuItem): Promise<void> {
    const props = item.toSnapshot();
    const { tenantId, id } = props;

    if (!tenantId || !id) {
      console.error("[PrismaMenuItemRepository] Missing identifiers:", { tenantId, id });
      throw new Error("Cannot save MenuItem: Missing tenantId or id");
    }

    console.log(`[PrismaMenuItemRepository] Saving item ${id} for tenant ${tenantId}`);

    await this.prisma.$transaction(async (tx) => {
      // 1. Verify existence if updating to prevent cross-tenant ID conflicts
      const existing = await tx.menuItem.findUnique({
        where: { tenantId_id: { tenantId, id } }
      });

      // 2. Upsert the main MenuItem
      const persistenceData = MenuItemMapper.toPersistence(item);
      await tx.menuItem.upsert({
        where: { tenantId_id: { tenantId, id } },
        create: { ...persistenceData, id },
        update: persistenceData,
      });

      // 2. Sync Images (Delete and recreate for simplicity in Aggregate root)
      await tx.menuItemImage.deleteMany({ where: { tenantId, menuItemId: id } });
      if (props.images.length > 0) {
        await tx.menuItemImage.createMany({
          data: props.images.map(img => {
            return {
              id: img.id,
              tenantId,
              menuItemId: id,
              imageUrl: img.imageUrl,
              isPrimary: !!img.isPrimary,
              sortOrder: img.sortOrder ?? 0,
            };
          }),
        });
      }

      // 3. Sync Variants
      await tx.menuItemVariant.deleteMany({ where: { tenantId, menuItemId: id } });
      if (props.variants.length > 0) {
        await tx.menuItemVariant.createMany({
          data: props.variants.map(v => {
            return {
              id: v.id,
              tenantId,
              menuItemId: id,
              nameKm: v.nameKm,
              nameEn: v.nameEn ?? null,
              attributeNameEn: v.attributeNameEn,
              attributeNameKm: v.attributeNameKm,
              priceCents: v.priceCents,
              costCents: v.costCents ?? null,
              sku: v.sku ?? null,
              isAvailable: v.isAvailable !== false,
              isDefault: !!v.isDefault,
              sortOrder: v.sortOrder ?? 0,
              updatedAt: new Date(), // Inject updatedAt to fix Prisma createMany not-null constraint failure
            };
          }),
        });
      }

      // 4. Sync OptionGroups & Options (Nested sync)
      await tx.menuItemOption.deleteMany({ where: { tenantId, menuItemId: id } });
      await tx.menuItemOptionGroup.deleteMany({ where: { tenantId, menuItemId: id } });

      for (const og of props.optionGroups) {
        // 4. Create the group header
        const createdOg = await tx.menuItemOptionGroup.create({
          data: {
            id: og.id,
            tenantId,
            menuItemId: id,
            nameKm: og.nameKm,
            nameEn: og.nameEn,
            minSelect: og.minSelect,
            maxSelect: og.maxSelect,
            sortOrder: og.sortOrder,
          },
        });

        // 5. Explicitly insert options one by one to prevent nested create conflicts
        for (const o of og.options) {
          await tx.menuItemOption.create({
            data: {
              id: o.id,
              tenantId,
              menuItemId: id,
              optionGroupId: createdOg.id,
              nameKm: o.nameKm,
              nameEn: o.nameEn,
              imageUrl: o.imageUrl,
              priceDeltaCents: o.priceDeltaCents,
              isAvailable: o.isAvailable,
              sortOrder: o.sortOrder,
            }
          });
        }
      }
    }).catch(err => {
      console.error("[PrismaMenuItemRepository] Transaction failed:", err);
      throw err;
    });
  }

  async findById(tenantId: string, id: string): Promise<MenuItem | null> {
    const raw = await this.prisma.menuItem.findUnique({
      where: { tenantId_id: { tenantId, id } },
      include: {
        images: true,
        variants: true,
        optionGroups: {
          include: { options: true },
        },
      },
    });

    if (!raw) return null;
    return MenuItemMapper.toDomain(raw as RawMenuItem);
  }

  async findAll(tenantId: string): Promise<MenuItem[]> {
    const raws = await this.prisma.menuItem.findMany({
      where: { tenantId },
      include: {
        images: true,
        variants: true,
        optionGroups: {
          include: { options: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return raws.map(raw => MenuItemMapper.toDomain(raw as RawMenuItem));
  }

  async findByCategory(tenantId: string, categoryId: string): Promise<MenuItem[]> {
    const raws = await this.prisma.menuItem.findMany({
      where: { 
        tenantId, 
        categoryId: categoryId === 'any' ? null : categoryId 
      },
      include: {
        images: true,
        variants: true,
        optionGroups: {
          include: { options: true },
        },
      },
    });

    return raws.map(raw => MenuItemMapper.toDomain(raw as RawMenuItem));
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.prisma.menuItem.delete({
      where: { tenantId_id: { tenantId, id } },
    });
  }
}
