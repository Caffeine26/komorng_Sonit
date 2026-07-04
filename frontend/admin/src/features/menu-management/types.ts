export interface MenuCategory {
  id: string
  tenantId: string
  nameEn: string
  nameKm?: string
  sortOrder: number
  isActive: boolean
  icon?: string
  urlBanner?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
  _count?: { items: number }
}

export interface MenuItem {
  id: string
  tenantId: string
  categoryId?: string
  nameEn: string
  nameKm?: string
  descriptionEn?: string
  descriptionKm?: string
  basePriceCents: number
  costCents?: number
  currency?: string
  unit?: string
  sku?: string
  isAvailable: boolean
  isVisible: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
  deletedAt?: string
  _count?: { variants: number; optionGroups: number }
  primaryImage?: MenuItemImage
  images?: MenuItemImage[]
  variants?: MenuItemVariant[]
  optionGroups?: MenuItemOptionGroup[]
}

export interface MenuItemImage {
  id: string
  tenantId: string
  menuItemId: string
  imageUrl: string
  altTextEn?: string
  altTextKm?: string
  sortOrder: number
  isPrimary: boolean
  createdAt: string
}

export interface MenuItemVariant {
  id: string
  tenantId: string
  menuItemId: string
  nameEn: string
  nameKm?: string
  attributeNameEn: string
  attributeNameKm: string
  priceCents: number
  costCents?: number
  sku?: string
  isAvailable: boolean
  isDefault: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface MenuItemOptionGroup {
  id: string
  tenantId: string
  menuItemId: string
  nameEn: string
  nameKm?: string
  minSelect: number
  maxSelect: number
  sortOrder: number
  createdAt: string
  updatedAt: string
  options?: MenuItemOption[]
}

export interface MenuItemOption {
  id: string
  tenantId: string
  menuItemId: string
  optionGroupId: string
  nameEn: string
  nameKm?: string
  imageUrl?: string
  priceDeltaCents: number
  isAvailable: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type CategoryFormData = {
  nameEn: string
  nameKm?: string
  sortOrder?: number
  isActive: boolean
  icon?: string
  urlBanner?: string
}

export type ItemFormData = {
  nameEn: string
  nameKm?: string
  descriptionEn?: string
  descriptionKm?: string
  basePriceCents: number
  costCents?: number
  unit?: string
  sku?: string
  categoryId?: string
  sortOrder?: number
  isAvailable: boolean
  isVisible: boolean
}

export type VariantFormData = {
  nameEn: string
  nameKm?: string
  attributeNameEn: string
  attributeNameKm: string
  priceCents: number
  costCents?: number
  sku?: string
  sortOrder?: number
  isAvailable: boolean
  isDefault: boolean
}

export type OptionGroupFormData = {
  nameEn: string
  nameKm?: string
  minSelect: number
  maxSelect: number
  sortOrder?: number
}

export type OptionFormData = {
  nameEn: string
  nameKm?: string
  imageUrl?: string
  priceDeltaCents: number
  isAvailable: boolean
  sortOrder?: number
}
