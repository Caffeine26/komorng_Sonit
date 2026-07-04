import { CartEntity } from '../entities/cart.entity';

// Shape stored in cart_items.variant_snapshot
export interface VariantSnapshotData {
  variantId: string;
  nameEn: string;
  nameKm: string | null;
  priceCents: number;
  attributeNameEn: string;
  attributeNameKm: string;
}

// Shape stored in cart_items.options_snapshot
export interface OptionSnapshotData {
  optionId: string;
  groupId: string;
  nameEn: string;
  nameKm: string | null;
  priceDeltaCents: number;
  groupNameEn: string;
  groupNameKm: string | null;
}

export interface ICartRepository {
  // Read
  findActiveBySession(tenantId: string, sessionId: string): Promise<CartEntity | null>;
  findById(tenantId: string, cartId: string): Promise<CartEntity | null>;

  // Write
  save(cart: CartEntity): Promise<void>;
  update(cart: CartEntity): Promise<void>;

  // Conversion (called by Order domain)
  markConverted(tenantId: string, cartId: string): Promise<void>;

  // Item name resolution
  resolveItemName(tenantId: string, menuItemId: string): Promise<{
    nameEn: string;
    nameKm: string | null;
    basePriceCents: number | null;
  } | null>;

  resolveVariantAndOptions(
    tenantId: string,
    menuItemId: string,
    variantId: string | null,
    optionIds: string[]
  ): Promise<{
    variantSnapshot: VariantSnapshotData | null;
    optionsSnapshot: OptionSnapshotData[];
  }>;
}

export const CART_REPOSITORY_PORT = Symbol('ICartRepository');

export interface CartSnapshot {
  cartId: string;
  sessionId: string;
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
