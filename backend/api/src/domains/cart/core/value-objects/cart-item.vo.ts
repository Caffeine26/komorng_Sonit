import { randomUUID } from 'crypto';

export interface CartItemProps {
  id?: string;
  cartId: string;
  menuItemId: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents?: number;
  variantSnapshot?: unknown | null;
  optionsSnapshot?: unknown | null;
  notes?: string | null;
}

export class CartItemVO {
  private props: Required<CartItemProps>;

  private constructor(props: Required<CartItemProps>) {
    this.props = { ...props };
  }

  get id() { return this.props.id; }
  get cartId() { return this.props.cartId; }
  get menuItemId() { return this.props.menuItemId; }
  get quantity() { return this.props.quantity; }
  get unitPriceCents() { return this.props.unitPriceCents; }
  get lineTotalCents() { return this.props.lineTotalCents; }
  get variantSnapshot() { return this.props.variantSnapshot; }
  get optionsSnapshot() { return this.props.optionsSnapshot; }
  get notes() { return this.props.notes; }

  public static create(params: CartItemProps): CartItemVO {
    const quantity = Math.max(1, params.quantity);
    const unitPriceCents = Math.max(0, params.unitPriceCents);
    const lineTotalCents = Math.floor(quantity * unitPriceCents);

    return new CartItemVO({
      id: params.id || randomUUID(),
      cartId: params.cartId,
      menuItemId: params.menuItemId,
      quantity,
      unitPriceCents,
      lineTotalCents,
      variantSnapshot: params.variantSnapshot || null,
      optionsSnapshot: params.optionsSnapshot || null,
      notes: params.notes || null,
    });
  }

  public withQuantity(qty: number): CartItemVO {
    return CartItemVO.create({
      ...this.props,
      quantity: qty,
    });
  }
}
