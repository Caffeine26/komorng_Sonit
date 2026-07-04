export interface OrderItemProps {
  id?: string;
  menuItemId?: string;
  itemName: string;
  quantity: number;
  unitPriceCents: number;
  variantSnapshot?: unknown;
  optionsSnapshot?: unknown;
  notes?: string;
  createdAt?: Date;
  kitchenStatus?: string;
  kitchenTicketId?: string | null;
}

export class OrderItemVO {
  public readonly id?: string;
  public readonly menuItemId?: string;
  public readonly itemName: string;
  public readonly quantity: number;
  public readonly unitPriceCents: number;
  public readonly variantSnapshot?: unknown;
  public readonly optionsSnapshot?: unknown;
  public readonly notes?: string;
  public readonly lineSubtotalCents: number;
  public readonly lineTotalCents: number;
  public readonly createdAt?: Date;
  public readonly kitchenStatus?: string;
  public readonly kitchenTicketId?: string | null;

  private constructor(props: OrderItemProps) {
    if (props.quantity < 1) {
      throw new Error('Quantity must be at least 1');
    }
    if (props.unitPriceCents < 0) {
      throw new Error('Unit price cannot be negative');
    }

    this.id = props.id;
    this.menuItemId = props.menuItemId;
    this.itemName = props.itemName;
    this.quantity = props.quantity;
    this.unitPriceCents = props.unitPriceCents;
    this.variantSnapshot = props.variantSnapshot;
    this.optionsSnapshot = props.optionsSnapshot;
    this.notes = props.notes;

    this.lineSubtotalCents = Math.floor(this.quantity * this.unitPriceCents);
    this.lineTotalCents = this.lineSubtotalCents;
    this.createdAt = props.createdAt;
    this.kitchenStatus = props.kitchenStatus;
    this.kitchenTicketId = props.kitchenTicketId;
  }

  public static create(props: OrderItemProps): OrderItemVO {
    return new OrderItemVO(props);
  }

  public acknowledge(): void {
    if (this.kitchenStatus === 'NEW') {
      // @ts-ignore - bypassing readonly for domain logic
      this.kitchenStatus = 'PREPARING';
    }
  }
}
