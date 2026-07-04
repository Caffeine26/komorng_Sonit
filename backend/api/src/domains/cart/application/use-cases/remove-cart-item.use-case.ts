import { Injectable, Inject } from '@nestjs/common';
import { CART_REPOSITORY_PORT, ICartRepository, CartSnapshot } from '../../core/ports/cart.repository.port';
import { CartNotFoundError } from '../../core/errors/cart.errors';

export interface RemoveCartItemInput {
  tenantId: string;
  cartId: string;
  cartItemId: string;
}

@Injectable()
export class RemoveCartItemUseCase {
  constructor(
    @Inject(CART_REPOSITORY_PORT)
    private readonly cartRepository: ICartRepository,
  ) {}

  async execute(input: RemoveCartItemInput): Promise<CartSnapshot> {
    const cart = await this.cartRepository.findById(input.tenantId, input.cartId);

    if (!cart) {
      throw new CartNotFoundError(input.cartId);
    }

    cart.removeItem(input.cartItemId);

    await this.cartRepository.update(cart);

    return cart.toSnapshot();
  }
}
