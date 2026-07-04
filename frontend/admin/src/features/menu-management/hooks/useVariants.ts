"use client"

import { useParams } from "next/navigation"
import { createAdminMenuItemVariant, updateAdminMenuItemVariant, deleteAdminMenuItemVariant } from "@/lib/api/menu";
import { VariantFormData } from "../types"

export function useVariants() {
  const params = useParams()
  const tenantSlug = params?.tenantSlug as string || ""

  async function createVariant(menuItemId: string, data: VariantFormData): Promise<any> {
    return await createAdminMenuItemVariant(menuItemId, data, tenantSlug)
  }

  async function updateVariant(menuItemId: string, variantId: string, data: any): Promise<any> {
    const payload = { ...data, id: variantId }
    return await updateAdminMenuItemVariant(menuItemId, variantId, payload, tenantSlug)
  }

  async function deleteVariant(menuItemId: string, variantId: string): Promise<void> {
    await deleteAdminMenuItemVariant(menuItemId, variantId, tenantSlug)
  }

  async function setDefaultVariant(menuItemId: string, variantId: string, existingVariants?: any[]): Promise<any> {
    return await updateVariant(menuItemId, variantId, { isDefault: true })
  }

  return {
    createVariant,
    updateVariant,
    deleteVariant,
    setDefaultVariant
  }
}
