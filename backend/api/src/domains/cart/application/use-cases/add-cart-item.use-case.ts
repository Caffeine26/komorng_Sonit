import { Injectable, Inject } from '@nestjs/common';
import { CART_REPOSITORY_PORT, ICartRepository, CartSnapshot } from '../../core/ports/cart.repository.port';
import { CartEntity } from '../../core/entities/cart.entity';
import { CartItemVO } from '../../core/value-objects/cart-item.vo';
import { ValidationError } from '../../../../shared/errors/domain-error';

export interface AddCartItemInput {
  tenantId: string;
  sessionId: string;
  menuItemId: string;
  quantity: number;
  unitPriceCents: number;
  variantId?: string | null;
  optionIds?: string[];
  notes?: string | null;
}

@Injectable()
export class AddCartItemUseCase {
  constructor(
    @Inject(CART_REPOSITORY_PORT)
    private readonly cartRepository: ICartRepository,
  ) {}

  async execute(input: AddCartItemInput): Promise<CartSnapshot> {
    let cart = await this.cartRepository.findActiveBySession(input.tenantId, input.sessionId);

    if (!cart) {
      cart = CartEntity.create({
        tenantId: input.tenantId,
        sessionId: input.sessionId,
      });
      await this.cartRepository.save(cart);
    }

    const dbItem = await this.cartRepository.resolveItemName(input.tenantId, input.menuItemId);
    if (!dbItem) {
      throw new ValidationError(`Menu item '${input.menuItemId}' not found or unavailable`);
    }

    const { variantSnapshot, optionsSnapshot } = await this.cartRepository.resolveVariantAndOptions(
      input.tenantId,
      input.menuItemId,
      input.variantId ?? null,
      input.optionIds ?? []
    );

    let finalUnitPriceCents = input.unitPriceCents;
    if (input.variantId) {
      // trust unitPriceCents from frontend
    } else {
      if (dbItem.basePriceCents !== null && Math.abs(input.unitPriceCents - dbItem.basePriceCents) > 1) {
        finalUnitPriceCents = dbItem.basePriceCents;
      }
    }

    const cartItem = CartItemVO.create({
      cartId: cart.id,
      menuItemId: input.menuItemId,
      quantity: input.quantity,
      unitPriceCents: finalUnitPriceCents,
      variantSnapshot,
      optionsSnapshot,
      notes: input.notes ?? null,
    });

    cart.addItem(cartItem);

    await this.cartRepository.update(cart);

    return cart.toSnapshot();
  }
}
