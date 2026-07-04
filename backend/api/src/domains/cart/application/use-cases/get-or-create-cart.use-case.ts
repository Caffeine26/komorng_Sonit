import { Injectable, Inject } from '@nestjs/common';
import { CART_REPOSITORY_PORT, ICartRepository } from '../../core/ports/cart.repository.port';
import { CartEntity } from '../../core/entities/cart.entity';

export interface GetOrCreateCartInput {
  tenantId: string;
  sessionId: string;
  createIfMissing?: boolean;
}

export interface GetOrCreateCartOutput {
  cartId: string;
  sessionId: string;
  status: 'ACTIVE';
  items: {
    id: string;
    menuItemId: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    variantSnapshot: unknown | null;
    optionsSnapshot: unknown | null;
    notes: string | null;
  }[];
  subtotalCents: number;
  itemCount: number;
}

@Injectable()
export class GetOrCreateCartUseCase {
  constructor(
    @Inject(CART_REPOSITORY_PORT)
    private readonly cartRepository: ICartRepository,
  ) {}

  async execute(input: GetOrCreateCartInput): Promise<GetOrCreateCartOutput> {
    let cart = await this.cartRepository.findActiveBySession(input.tenantId, input.sessionId);

    if (!cart) {
      if (input.createIfMissing) {
        cart = CartEntity.create({
          tenantId: input.tenantId,
          sessionId: input.sessionId,
        });
        await this.cartRepository.save(cart);
      } else {
        return {
          cartId: '',
          sessionId: input.sessionId,
          status: 'ACTIVE',
          items: [],
          subtotalCents: 0,
          itemCount: 0,
        };
      }
    }

    return {
      cartId: cart.id,
      sessionId: cart.sessionId,
      status: 'ACTIVE',
      items: cart.items.map(item => ({
        id: item.id!,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.lineTotalCents!,
        variantSnapshot: item.variantSnapshot ?? null,
        optionsSnapshot: item.optionsSnapshot ?? null,
        notes: item.notes ?? null,
      })),
      subtotalCents: cart.subtotalCents,
      itemCount: cart.itemCount,
    };
  }
}
