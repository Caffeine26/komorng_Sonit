"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { getAdminMenuItems, createAdminMenuItem, updateAdminMenuItem, deleteAdminMenuItem, reorderAdminMenuItems } from "@/lib/api/menu";
import { getAdminMenuItemDetail } from "@/lib/api/menu";
import { MenuItem, ItemFormData } from "../types"

export function useItems(categoryId?: string) {
  const params = useParams()
  const tenantSlug = params?.tenantSlug as string || ""

  const [items, setItems] = useState<MenuItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchItems = useCallback(async () => {
    if (!categoryId && categoryId !== '') return
    setIsLoading(true)
    setError(null)
    try {
      const data = await getAdminMenuItems(categoryId, tenantSlug)
      const sorted = (data || []).sort((a: any, b: any) => a.sortOrder - b.sortOrder)
      setItems(sorted as MenuItem[])
    } catch (err: any) {
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }, [categoryId, tenantSlug])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  async function getItem(itemId: string): Promise<MenuItem> {
    const catId = categoryId || "any"
    const res = await getAdminMenuItemDetail(catId, itemId, tenantSlug)
    return res as unknown as MenuItem
  }

  async function createItem(data: ItemFormData): Promise<MenuItem> {
    const catId = categoryId || data.categoryId
    if (!catId) throw new Error("Category ID is required")
    const res = await createAdminMenuItem(catId, data as any, tenantSlug)
    return res as unknown as MenuItem
  }

  async function update(itemId: string, data: Partial<ItemFormData>): Promise<MenuItem> {
    const catId = categoryId || "any"
    const res = await updateAdminMenuItem(catId, itemId, { ...data, id: itemId } as any, tenantSlug)
    return res as unknown as MenuItem
  }

  async function deleteItem(itemId: string): Promise<void> {
    const catId = categoryId || "any"
    await deleteAdminMenuItem(catId, itemId, tenantSlug)
  }

  async function reorder(reorderList: { id: string; sortOrder: number }[]): Promise<void> {
    if (!categoryId) return
    await reorderAdminMenuItems(categoryId, reorderList, tenantSlug)
  }

  return {
    items,
    isLoading,
    error,
    refetch: fetchItems,
    getItem,
    createItem,
    updateItem: update,
    deleteItem,
    reorderItems: reorder,
  }
}
