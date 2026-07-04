"use client"

import { useParams } from "next/navigation"
import { createAdminMenuItemOption, updateAdminMenuItemOption, deleteAdminMenuItemOption } from "@/lib/api/menu";
import { OptionFormData } from "../types"

export function useOptions() {
  const params = useParams()
  const tenantSlug = params?.tenantSlug as string || ""

  async function createOpt(menuItemId: string, groupId: string, data: OptionFormData): Promise<any> {
    return await createAdminMenuItemOption(menuItemId, groupId, data, tenantSlug)
  }

  async function updateOpt(menuItemId: string, groupId: string, optionId: string, data: Partial<OptionFormData>): Promise<any> {
    return await updateAdminMenuItemOption(menuItemId, groupId, optionId, data, tenantSlug)
  }

  async function deleteOpt(menuItemId: string, groupId: string, optionId: string): Promise<void> {
    await deleteAdminMenuItemOption(menuItemId, groupId, optionId, tenantSlug)
  }

  return {
    createOption: createOpt,
    updateOption: updateOpt,
    deleteOption: deleteOpt
  }
}
