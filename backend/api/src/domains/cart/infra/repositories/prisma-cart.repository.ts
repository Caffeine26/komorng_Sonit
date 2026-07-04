import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  ICartRepository,
  VariantSnapshotData,
  OptionSnapshotData,
} from '../../core/ports/cart.repository.port';
import { CartEntity } from '../../core/entities/cart.entity';
import { CartMapper } from '../mappers/cart.mapper';

@Injectable()
export class CartRepositoryImpl implements ICartRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────── READ ────────────────────────────────────

  async findActiveBySession(
    tenantId: string,
    sessionId: string,
  ): Promise<CartEntity | null> {
    const raw = await this.prisma.cart.findFirst({
      where: { tenantId, sessionId, status: 'ACTIVE' },
      include: { items: true },
    });
    return raw ? CartMapper.toDomain(raw) : null;
  }

  async findById(tenantId: string, cartId: string): Promise<CartEntity | null> {
    const raw = await this.prisma.cart.findFirst({
      where: { tenantId, id: cartId },
      include: { items: true },
    });
    return raw ? CartMapper.toDomain(raw) : null;
  }

  // ─────────────────────────────── WRITE ───────────────────────────────────

  async save(cart: CartEntity): Promise<void> {
    await this.prisma.cart.create({
      data: {
        tenantId: cart.tenantId,
        id: cart.id,
        sessionId: cart.sessionId,
        status: cart.status,
        version: cart.version,
        items: cart.items.length > 0 ? {
          createMany: {
            data: cart.items.map((item) =>
              CartMapper.itemToPersistence(item, cart.id, cart.tenantId),
            ),
          },
        } : undefined,
      },
    });
  }

  async update(cart: CartEntity): Promise<void> {
    const transactions: any[] = [
      // 1. Delete all existing items for this cart
      this.prisma.cartItem.deleteMany({
        where: { tenantId: cart.tenantId, cartId: cart.id },
      }),
    ];

    // 2. Re-insert current items ONLY if there are any
    if (cart.items.length > 0) {
      transactions.push(
        this.prisma.cartItem.createMany({
          data: cart.items.map((item) =>
            CartMapper.itemToPersistence(item, cart.id, cart.tenantId),
          ),
        })
      );
    }

    // 3. Bump version + updatedAt on the cart row
    transactions.push(
      this.prisma.cart.update({
        where: { tenantId_id: { tenantId: cart.tenantId, id: cart.id } },
        data: { version: { increment: 1 }, updatedAt: new Date() },
      })
    );

    await this.prisma.$transaction(transactions);
  }

  // ─────────────────────────────── CONVERSION ──────────────────────────────

  async markConverted(tenantId: string, cartId: string): Promise<void> {
    await this.prisma.cart.update({
      where: { tenantId_id: { tenantId, id: cartId } },
      data: { status: 'CONVERTED', updatedAt: new Date() },
    });
  }

  // ─────────────────────────────── RESOLUTION ──────────────────────────────

  async resolveItemName(
    tenantId: string,
    menuItemId: string,
  ): Promise<{ nameEn: string; nameKm: string | null; basePriceCents: number | null } | null> {
    const item = await this.prisma.menuItem.findFirst({
      where: { tenantId, id: menuItemId, isAvailable: true, deletedAt: null },
      select: { nameEn: true, nameKm: true, basePriceCents: true },
    });
    if (!item) return null;
    return {
      nameEn: item.nameEn ?? '',
      nameKm: item.nameKm ?? null,
      basePriceCents: item.basePriceCents ?? null,
    };
  }

  async resolveVariantAndOptions(
    tenantId: string,
    menuItemId: string,
    variantId: string | null,
    optionIds: string[],
  ): Promise<{
    variantSnapshot: VariantSnapshotData | null;
    optionsSnapshot: OptionSnapshotData[];
  }> {
    // ── variant ──────────────────────────────────────────────────────────
    let variantSnapshot: VariantSnapshotData | null = null;
    if (variantId) {
      const variant = await this.prisma.menuItemVariant.findFirst({
        where: { tenantId, id: variantId, menuItemId, isAvailable: true, deletedAt: null },
        select: {
          id: true,
          nameEn: true,
          nameKm: true,
          priceCents: true,
          attributeNameEn: true,
          attributeNameKm: true,
        },
      });
      if (variant) {
        variantSnapshot = {
          variantId: variant.id,
          nameEn: variant.nameEn ?? '',
          nameKm: variant.nameKm ?? null,
          priceCents: variant.priceCents,
          attributeNameEn: variant.attributeNameEn,
          attributeNameKm: variant.attributeNameKm,
        };
      }
    }

    // ── options ───────────────────────────────────────────────────────────
    let optionsSnapshot: OptionSnapshotData[] = [];
    if (optionIds.length > 0) {
      const options = await this.prisma.menuItemOption.findMany({
        where: { tenantId, menuItemId, id: { in: optionIds }, isAvailable: true },
        select: {
          id: true,
          optionGroupId: true,
          nameEn: true,
          nameKm: true,
          priceDeltaCents: true,
          optionGroup: { select: { nameEn: true, nameKm: true } },
        },
      });
      optionsSnapshot = options.map((o: typeof options[number]) => ({
        optionId: o.id,
        groupId: o.optionGroupId,
        nameEn: o.nameEn ?? '',
        nameKm: o.nameKm ?? null,
        priceDeltaCents: o.priceDeltaCents,
        groupNameEn: o.optionGroup.nameEn ?? '',
        groupNameKm: o.optionGroup.nameKm ?? null,
      }));
    }

    return { variantSnapshot, optionsSnapshot };
  }
}
