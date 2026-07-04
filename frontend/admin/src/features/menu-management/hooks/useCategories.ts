"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { getAdminCategories, createAdminCategory, updateAdminCategory, deleteAdminCategory, reorderAdminCategories } from "@/lib/api/menu";
import { MenuCategory, CategoryFormData } from "../types"

export function useCategories() {
  const params = useParams()
  const tenantSlug = params?.tenantSlug as string || ""

  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchCategories = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getAdminCategories(tenantSlug)
      // Sort categories by sortOrder ascending
      const sorted = (data || []).sort((a: any, b: any) => a.sortOrder - b.sortOrder)
      setCategories(sorted as MenuCategory[])
    } catch (err: any) {
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }, [tenantSlug])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  async function create(data: CategoryFormData): Promise<MenuCategory> {
    const payload = {
      ...data,
      nameKm: data.nameKm || "",
      sortOrder: data.sortOrder ?? 0
    }
    const res = await createAdminCategory(payload, tenantSlug)
    return res as unknown as MenuCategory
  }

  async function update(id: string, data: Partial<CategoryFormData>): Promise<MenuCategory> {
    const payload = {
      ...data,
      id,
      nameKm: data.nameKm || ""
    }
    const res = await updateAdminCategory(id, payload as any, tenantSlug)
    return res as unknown as MenuCategory
  }

  async function remove(id: string): Promise<void> {
    await deleteAdminCategory(id, tenantSlug)
  }

  async function reorder(reorderList: { id: string; sortOrder: number }[]): Promise<void> {
    await reorderAdminCategories(reorderList, tenantSlug)
  }

  return {
    categories,
    isLoading,
    error,
    refetch: fetchCategories,
    createCategory: create,
    updateCategory: update,
    deleteCategory: remove,
    reorderCategories: reorder,
  }
}
