import { CartItemVO } from '../value-objects/cart-item.vo';
import { 
  CartAlreadyConvertedError, 
  CartItemNotFoundError 
} from '../errors/cart.errors';
import { CartStatus } from '@xfos/contracts-enums';
import { CartSnapshot } from '../ports/cart.repository.port';
import { randomUUID } from 'crypto';
import { ValidationError } from '../../../../shared/errors/domain-error';

export interface CartProps {
  tenantId: string;
  sessionId: string;
  id?: string;
  status?: CartStatus;
  items?: CartItemVO[];
  version?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class CartEntity {
  private props: Required<CartProps>;

  private constructor(props: Required<CartProps>) {
    this.props = { ...props };
  }

  get tenantId() { return this.props.tenantId; }
  get id() { return this.props.id; }
  get sessionId() { return this.props.sessionId; }
  get status() { return this.props.status; }
  get items() { return [...this.props.items]; }
  get version() { return this.props.version; }
  get createdAt() { return this.props.createdAt; }
  get updatedAt() { return this.props.updatedAt; }

  public static create(params: { tenantId: string; sessionId: string }): CartEntity {
    return new CartEntity({
      tenantId: params.tenantId,
      sessionId: params.sessionId,
      id: randomUUID(),
      status: 'ACTIVE',
      items: [],
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  public static reconstitute(props: Required<CartProps>): CartEntity {
    return new CartEntity(props);
  }

  private assertActive(): void {
    if (this.props.status !== 'ACTIVE') {
      throw new CartAlreadyConvertedError(this.props.id);
    }
  }

  public addItem(item: CartItemVO): void {
    this.assertActive();

    // Check if the same item already exists (same menuItemId, variantSnapshot, optionsSnapshot, notes)
    const existingIndex = this.props.items.findIndex(i => 
      i.menuItemId === item.menuItemId &&
      JSON.stringify(i.variantSnapshot) === JSON.stringify(item.variantSnapshot) &&
      JSON.stringify(i.optionsSnapshot) === JSON.stringify(item.optionsSnapshot) &&
      i.notes === item.notes
    );

    if (existingIndex >= 0) {
      const existing = this.props.items[existingIndex];
      this.props.items[existingIndex] = existing.withQuantity(existing.quantity + item.quantity);
    } else {
      this.props.items.push(item);
    }
  }

  public updateItem(cartItemId: string, quantity: number): void {
    this.assertActive();

    if (quantity < 1) {
      throw new ValidationError('Quantity must be at least 1');
    }

    const index = this.props.items.findIndex(i => i.id === cartItemId);
    if (index === -1) {
      throw new CartItemNotFoundError(cartItemId);
    }

    this.props.items[index] = this.props.items[index].withQuantity(quantity);
  }

  public removeItem(cartItemId: string): void {
    this.assertActive();

    const index = this.props.items.findIndex(i => i.id === cartItemId);
    if (index === -1) {
      throw new CartItemNotFoundError(cartItemId);
    }

    this.props.items.splice(index, 1);
  }

  public markConverted(): void {
    this.assertActive();
    this.props.status = 'CONVERTED';
    this.props.updatedAt = new Date();
  }

  get subtotalCents(): number {
    return this.props.items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  }

  get itemCount(): number {
    return this.props.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  public toSnapshot(): CartSnapshot {
    return {
      cartId: this.id,
      sessionId: this.sessionId,
      items: this.items.map(item => ({
        id: item.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.lineTotalCents,
        variantSnapshot: item.variantSnapshot,
        optionsSnapshot: item.optionsSnapshot,
        notes: item.notes,
      })),
      subtotalCents: this.subtotalCents,
      itemCount: this.itemCount,
    };
  }
}
