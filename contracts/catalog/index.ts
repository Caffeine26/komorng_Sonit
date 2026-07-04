import { z } from 'zod';

// ==========================================
// Base Enums & Shared
// ==========================================
export const CurrencySchema = z.enum(['USD', 'KHR']);

// ==========================================
// MenuItem Components
// ==========================================

export const MenuItemImageSchema = z.object({
  id: z.string().optional(),
  imageUrl: z.string().url(),
  isPrimary: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const MenuItemOptionSchema = z.object({
  id: z.string().optional(),
  nameKm: z.string(),
  nameEn: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  priceDeltaCents: z.number().int().default(0),
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const MenuItemOptionGroupSchema = z.object({
  id: z.string().optional(),
  nameKm: z.string(),
  nameEn: z.string().nullable().optional(),
  minSelect: z.number().int().default(0),
  maxSelect: z.number().int().default(1),
  sortOrder: z.number().int().default(0),
  options: z.array(MenuItemOptionSchema).default([]),
});

export const MenuItemVariantSchema = z.object({
  id: z.string().optional(),
  nameKm: z.string(),
  nameEn: z.string().nullable().optional(),
  attributeNameEn: z.string(),
  attributeNameKm: z.string(),
  priceCents: z.number().int().nonnegative(),
  sku: z.string().nullable().optional(),
  costCents: z.number().int().nonnegative().nullable().optional(),
  isAvailable: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

// ==========================================
// MenuItem (The Main Entity)
// ==========================================

export const MenuItemSchema = z.object({
  id: z.string().optional(),
  categoryId: z.string().nullable().optional(),
  nameKm: z.string(),
  nameEn: z.string().nullable().optional(),
  descriptionKm: z.string().nullable().optional(),
  descriptionEn: z.string().nullable().optional(),
  basePriceCents: z.number().int().nonnegative().nullable().optional(),
  costCents: z.number().int().nonnegative().nullable().optional(),
  currency: CurrencySchema.default('USD'),
  unit: z.string().nullable().optional(),
  sku: z.string().nullable().optional(),
  isAvailable: z.boolean().default(true),
  isVisible: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  
  // Relations
  images: z.array(MenuItemImageSchema).default([]),
  variants: z.array(MenuItemVariantSchema).default([]),
  optionGroups: z.array(MenuItemOptionGroupSchema).default([]),
});

export type MenuItem = z.infer<typeof MenuItemSchema>;

// ==========================================
// MenuCategory
// ==========================================

export const CategorySchema = z.object({
  id: z.string().optional(),
  nameKm: z.string(),
  nameEn: z.string(),
  icon: z.string().nullable().optional(),
  urlBanner: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  
  // Optional: Items can be included in some responses
  items: z.array(MenuItemSchema).optional(),
});

export type Category = z.infer<typeof CategorySchema>;

// ==========================================
// API Request/Response Projections
// ==========================================

export const CreateCategoryRequestSchema = CategorySchema.omit({ id: true });
export const UpdateCategoryRequestSchema = CategorySchema.partial().extend({ id: z.string() });

export const CreateMenuItemRequestSchema = MenuItemSchema.omit({ id: true });
export const UpdateMenuItemRequestSchema = MenuItemSchema.partial().extend({ id: z.string() });

export const CatalogOverviewResponseSchema = z.object({
  categories: z.array(CategorySchema),
});
