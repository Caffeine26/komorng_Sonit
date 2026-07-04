"use client"

import { useParams } from "next/navigation"
import { createAdminMenuItemOptionGroup, updateAdminMenuItemOptionGroup, deleteAdminMenuItemOptionGroup } from "@/lib/api/menu";
import { OptionGroupFormData } from "../types"

export function useOptionGroups() {
  const params = useParams()
  const tenantSlug = params?.tenantSlug as string || ""

  async function createGroup(menuItemId: string, data: OptionGroupFormData): Promise<any> {
    return await createAdminMenuItemOptionGroup(menuItemId, data, tenantSlug)
  }

  async function updateGroup(menuItemId: string, groupId: string, data: Partial<OptionGroupFormData>): Promise<any> {
    return await updateAdminMenuItemOptionGroup(menuItemId, groupId, data, tenantSlug)
  }

  async function deleteGroup(menuItemId: string, groupId: string): Promise<void> {
    await deleteAdminMenuItemOptionGroup(menuItemId, groupId, tenantSlug)
  }

  return {
    createOptionGroup: createGroup,
    updateOptionGroup: updateGroup,
    deleteOptionGroup: deleteGroup
  }
}
