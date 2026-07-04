export interface MenuItemImageProps {
  id?: string;
  imageUrl: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface MenuItemVariantProps {
  id?: string;
  nameKm: string;
  nameEn?: string | null;
  attributeNameEn: string;
  attributeNameKm: string;
  priceCents: number;
  sku?: string | null;
  costCents?: number | null;
  isAvailable: boolean;
  isDefault: boolean;
  sortOrder: number;
}

export interface MenuItemOptionProps {
  id?: string;
  nameKm: string;
  nameEn?: string | null;
  imageUrl?: string | null;
  priceDeltaCents: number;
  isAvailable: boolean;
  sortOrder: number;
}

export interface MenuItemOptionGroupProps {
  id?: string;
  nameKm: string;
  nameEn?: string | null;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  options: MenuItemOptionProps[];
}

export interface MenuItemProps {
  id: string;
  tenantId: string;
  categoryId?: string | null;
  nameKm: string;
  nameEn?: string | null;
  descriptionKm?: string | null;
  descriptionEn?: string | null;
  basePriceCents?: number | null;
  costCents?: number | null;
  unit?: string | null;
  sku?: string | null;
  isAvailable: boolean;
  isVisible: boolean;
  sortOrder: number;
  
  // Normalized relations (Aggregate members)
  images: MenuItemImageProps[];
  variants: MenuItemVariantProps[];
  optionGroups: MenuItemOptionGroupProps[];
  
  createdAt?: Date;
  updatedAt?: Date;
}

export class MenuItem {
  constructor(private readonly props: MenuItemProps) {
    this.validate();
  }

  private validate() {
    if (!this.props.tenantId) throw new Error('Tenant ID is required');
    if (!this.props.nameKm) throw new Error('Product name in Khmer is required');
  }

  get id() { return this.props.id; }
  get tenantId() { return this.props.tenantId; }
  get categoryId() { return this.props.categoryId; }
  get nameKm() { return this.props.nameKm; }
  get nameEn() { return this.props.nameEn; }
  get descriptionKm() { return this.props.descriptionKm; }
  get descriptionEn() { return this.props.descriptionEn; }
  get basePriceCents() { return this.props.basePriceCents; }
  get costCents() { return this.props.costCents; }
  get unit() { return this.props.unit; }
  get sku() { return this.props.sku; }
  get isAvailable() { return this.props.isAvailable; }
  get isVisible() { return this.props.isVisible; }
  get sortOrder() { return this.props.sortOrder; }
  
  get images() { return this.props.images; }
  get variants() { return this.props.variants; }
  get optionGroups() { return this.props.optionGroups; }

  static create(props: MenuItemProps): MenuItem {
    return new MenuItem({
      ...props,
      createdAt: props.createdAt || new Date(),
      updatedAt: props.updatedAt || new Date(),
    });
  }

  public update(payload: Partial<MenuItemProps>): void {
    Object.assign(this.props, payload);
    this.props.updatedAt = new Date();
    this.validate();
  }

  public addVariant(variant: MenuItemVariantProps): void {
    if (!variant.id) {
      variant.id = `var_${Math.random().toString(36).substring(2, 12)}`;
    }
    if (variant.isDefault) {
      this.props.variants.forEach(v => v.isDefault = false);
    }
    this.props.variants.push(variant);
    this.props.updatedAt = new Date();
  }

  public updateVariant(id: string, payload: Partial<MenuItemVariantProps>): void {
    const index = this.props.variants.findIndex(v => v.id === id);
    if (index === -1) throw new Error('Variant not found');
    
    if (payload.isDefault) {
      this.props.variants.forEach(v => v.isDefault = false);
    }
    this.props.variants[index] = { ...this.props.variants[index], ...payload };
    this.props.updatedAt = new Date();
  }

  public removeVariant(id: string): void {
    this.props.variants = this.props.variants.filter(v => v.id !== id);
    this.props.updatedAt = new Date();
  }

  // --- Images ---
  public addImage(image: MenuItemImageProps): void {
    if (!image.id) {
      image.id = `img_${Math.random().toString(36).substring(2, 12)}`;
    }
    if (image.isPrimary) {
      this.props.images.forEach(img => img.isPrimary = false);
    } else if (this.props.images.length === 0) {
      // First image defaults to primary
      image.isPrimary = true;
    }
    
    this.props.images.push(image);
    this.props.updatedAt = new Date();
  }

  public updateImage(id: string, payload: Partial<MenuItemImageProps>): void {
    const index = this.props.images.findIndex(img => img.id === id);
    if (index === -1) throw new Error('Image not found');
    
    if (payload.isPrimary) {
      this.props.images.forEach(img => img.isPrimary = false);
    }
    
    this.props.images[index] = { ...this.props.images[index], ...payload };
    this.props.updatedAt = new Date();
  }

  public removeImage(id: string): void {
    const image = this.props.images.find(img => img.id === id);
    this.props.images = this.props.images.filter(img => img.id !== id);
    
    // If we deleted the primary image, make the first available image primary
    if (image?.isPrimary && this.props.images.length > 0) {
      this.props.images[0].isPrimary = true;
    }
    
    this.props.updatedAt = new Date();
  }

  // --- Option Groups ---
  public addOptionGroup(group: MenuItemOptionGroupProps): void {
    if (!group.id) {
      group.id = `og_${Math.random().toString(36).substring(2, 12)}`;
    }
    this.props.optionGroups.push(group);
    this.props.updatedAt = new Date();
  }

  public updateOptionGroup(id: string, payload: Partial<MenuItemOptionGroupProps>): void {
    const index = this.props.optionGroups.findIndex(og => og.id === id);
    if (index === -1) throw new Error('Option Group not found');
    
    this.props.optionGroups[index] = { ...this.props.optionGroups[index], ...payload };
    this.props.updatedAt = new Date();
  }

  public removeOptionGroup(id: string): void {
    this.props.optionGroups = this.props.optionGroups.filter(og => og.id !== id);
    this.props.updatedAt = new Date();
  }

  // --- Options ---
  public addOption(groupId: string, option: MenuItemOptionProps): void {
    const group = this.props.optionGroups.find(og => og.id === groupId);
    if (!group) throw new Error('Option Group not found');
    if (!group.options) group.options = [];

    if (!option.id) {
      option.id = `opt_${Math.random().toString(36).substring(2, 12)}`;
    }
    group.options.push(option);
    this.props.updatedAt = new Date();
  }

  public updateOption(groupId: string, optionId: string, payload: Partial<MenuItemOptionProps>): void {
    const group = this.props.optionGroups.find(og => og.id === groupId);
    if (!group) throw new Error('Option Group not found');
    if (!group.options) group.options = [];

    const index = group.options.findIndex(opt => opt.id === optionId);
    if (index === -1) throw new Error('Option not found');

    group.options[index] = { ...group.options[index], ...payload };
    this.props.updatedAt = new Date();
  }

  public removeOption(groupId: string, optionId: string): void {
    const group = this.props.optionGroups.find(og => og.id === groupId);
    if (!group) throw new Error('Option Group not found');
    if (!group.options) return;

    group.options = group.options.filter(opt => opt.id !== optionId);
    this.props.updatedAt = new Date();
  }

  toSnapshot(): MenuItemProps {
    return { ...this.props };
  }
}
