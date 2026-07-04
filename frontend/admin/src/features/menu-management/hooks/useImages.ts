"use client"

import { useParams } from "next/navigation"
import { uploadMenuItemImage } from "@/lib/api/menu";
import { createAdminMenuItemImage, updateAdminMenuItemImage, deleteAdminMenuItemImage } from "@/lib/api/menu";

export function useImages() {
  const params = useParams()
  const tenantSlug = params?.tenantSlug as string || ""

  async function uploadImageFile(file: File): Promise<string> {
    const res = await uploadMenuItemImage(file, tenantSlug)
    return res.url
  }

  async function createItemImage(menuItemId: string, imageUrl: string, isPrimary: boolean): Promise<any> {
    return await createAdminMenuItemImage(menuItemId, { imageUrl, isPrimary }, tenantSlug)
  }

  async function updateItemImage(menuItemId: string, imageId: string, isPrimary: boolean): Promise<any> {
    return await updateAdminMenuItemImage(menuItemId, imageId, { isPrimary }, tenantSlug)
  }

  async function deleteItemImage(menuItemId: string, imageId: string): Promise<void> {
    await deleteAdminMenuItemImage(menuItemId, imageId, tenantSlug)
  }

  async function uploadImage(menuItemId: string, file: File): Promise<any> {
    const url = await uploadImageFile(file)
    return await createItemImage(menuItemId, url, false)
  }

  async function setPrimaryImage(menuItemId: string, imageId: string, existingImages?: any[]): Promise<any> {
    return await updateItemImage(menuItemId, imageId, true)
  }

  async function deleteImage(menuItemId: string, imageId: string): Promise<void> {
    await deleteItemImage(menuItemId, imageId)
  }

  return {
    uploadImageFile,
    createItemImage,
    updateItemImage,
    deleteItemImage,
    uploadImage,
    setPrimaryImage,
    deleteImage
  }
}
