import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { ICategoryRepository } from '../../core/ports/category.repository.port';
import { MenuCategory } from '../../core/entities/menu-category.entity';
import { toDomain, toPersistence } from '../mappers/category.mapper';

@Injectable()
export class PrismaCategoryRepository implements ICategoryRepository {
    constructor(private readonly prisma: PrismaService) { }

    async save(category: MenuCategory): Promise<void> {
        const data = toPersistence(category);

        await this.prisma.menuCategory.upsert({
            where: {
                tenantId_id: {
                    tenantId: data.tenantId,
                    id: data.id,
                },
            },
            update: data,
            create: data,
        });
    }

    async findById(tenantId: string, id: string): Promise<MenuCategory | null> {
        const raw = await this.prisma.menuCategory.findUnique({
            where: {
                tenantId_id: {
                    tenantId,
                    id,
                },
            },
        });

        if (!raw) return null;
        return toDomain(raw);
    }

    async findMany(tenantId: string): Promise<MenuCategory[]> {
        const raw = await this.prisma.menuCategory.findMany({
            where: {
                tenantId,
                deletedAt: null
            },
            include: {
                _count: {
                    select: {
                        items: {
                            where: { deletedAt: null }
                        }
                    }
                }
            },
            orderBy: { sortOrder: 'asc' },
        });

        return raw.map(r => toDomain(r as any));
    }

    async delete(tenantId: string, id: string): Promise<void> {
        await this.prisma.menuCategory.update({
            where: {
                tenantId_id: {
                    tenantId,
                    id,
                },
            },
            data: {
                deletedAt: new Date(),
                isActive: false
            }
        });
    }
}
