import { Cart as PrismaCart, CartItem as PrismaCartItem } from '@xfos/database';
import { CartEntity } from '../../core/entities/cart.entity';
import { CartItemVO } from '../../core/value-objects/cart-item.vo';
import { CartStatus } from '@xfos/contracts-enums';

export class CartMapper {
  static toDomain(
    raw: PrismaCart & { items: PrismaCartItem[] },
  ): CartEntity {
    const items = raw.items.map((i: PrismaCartItem) =>
      CartItemVO.create({
        id: i.id,
        cartId: i.cartId,
        menuItemId: i.menuItemId,
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
        variantSnapshot: i.variantSnapshot ?? null,
        optionsSnapshot: i.optionsSnapshot ?? null,
        notes: i.notes ?? null,
      }),
    );

    return CartEntity.reconstitute({
      tenantId: raw.tenantId,
      id: raw.id,
      sessionId: raw.sessionId,
      status: raw.status as CartStatus,
      items,
      version: raw.version,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  static itemToPersistence(
    item: CartItemVO,
    cartId: string,
    tenantId: string,
  ) {
    return {
      tenantId,
      id: item.id,
      cartId,
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      variantSnapshot: (item.variantSnapshot as object) ?? undefined,
      optionsSnapshot: (item.optionsSnapshot as object) ?? undefined,
      notes: item.notes ?? undefined,
    };
  }
}
