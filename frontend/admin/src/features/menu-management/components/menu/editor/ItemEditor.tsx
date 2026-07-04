"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { ArrowLeft, Check, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BasicInfoTab } from "./tabs/BasicInfoTab"
import { PhotosTab } from "./tabs/PhotosTab"
import { VariantsTab } from "./tabs/VariantsTab"
import { CustomizationsTab } from "./tabs/CustomizationsTab"
import { LiveStorefrontPreview } from "./LiveStorefrontPreview"
import { useItems } from "../../../hooks/useItems"
import { MenuItem } from "../../../types"
import { cn } from "@/lib/utils/cn"

export function ItemEditor() {
  const router = useRouter()
  const params = useParams()
  
  const locale = useLocale()
  const tenantSlug = params?.tenantSlug as string || ""
  const categoryId = params?.categoryId as string || ""
  const itemId = params?.itemId as string || ""

  const { getItem, updateItem } = useItems(categoryId)
  const [item, setItem] = useState<MenuItem | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  const [activeTab, setActiveTab] = useState<"basic" | "photos" | "variants" | "customizations">("basic")
  
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle")

  // Shared state for attached items to update count badges live
  const [attachedVariants, setAttachedVariants] = useState<any[]>([])
  const [attachedGroups, setAttachedGroups] = useState<any[]>([])

  const fetchItem = useCallback(async () => {
    if (!itemId) return
    setIsLoading(true)
    try {
      const data = await getItem(itemId)
      setItem(data)
      if (data) {
        setAttachedVariants(data.variants || [])
        setAttachedGroups(data.optionGroups || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [itemId])

  useEffect(() => {
    fetchItem()
  }, [fetchItem])

  async function handleSaveBasicInfo(data: any) {
    if (!item) return
    setSaving(true)
    setSaveStatus("idle")
    try {
      const res = await updateItem(item.id, data)
      setItem(res)
      setSaveStatus("success")
      setTimeout(() => setSaveStatus("idle"), 2500)
    } catch (err) {
      console.error(err)
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        <span className="text-xs text-zinc-500 font-medium">Loading product editor...</span>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
        <AlertCircle className="w-10 h-10 text-zinc-400 mb-3" />
        <h3 className="text-base font-semibold text-zinc-900">Product not found</h3>
        <p className="text-xs text-zinc-500 mt-1 mb-5">The item you are trying to edit doesn't exist or has been deleted.</p>
        <Button onClick={() => router.push(`/${tenantSlug}/menu/${categoryId}`)} size="sm">
          Go Back
        </Button>
      </div>
    )
  }

  const tabs = [
    { id: "basic", label: "Basic Info", count: 0 },
    { id: "photos", label: "Photos", count: item.images?.length || 0 },
    { id: "variants", label: "Variants", count: attachedVariants.length },
    { id: "customizations", label: "Customizations", count: attachedGroups.length },
  ] as const

  return (
    <div className="flex flex-col min-h-screen bg-[#F8FAFC]">
      {/* Top sticky action-header with premium back-navigation */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-zinc-200/50 px-6 sm:px-8 py-5 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push(`/${tenantSlug}/menu/${categoryId}`)}
              className="p-2.5 rounded-xl border border-zinc-200/60 bg-white text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50 shadow-sm transition-all focus:outline-none"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[20px] font-semibold text-zinc-950 tracking-tight leading-none">
                  {item.nameEn}
                </h1>
                {item.sku && (
                  <span className="text-[10px] font-medium font-mono bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-md">
                    {item.sku}
                  </span>
                )}
              </div>
              <p className="text-[12px] text-zinc-500 mt-1 font-medium">
                Catalog / Edit Product
              </p>
            </div>
          </div>

          {/* Save Status banner */}
          <div className="flex items-center gap-3">
            {saveStatus === "success" && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100/50 animate-in fade-in duration-300">
                <Check className="w-3.5 h-3.5" /> All changes saved
              </span>
            )}
            {saveStatus === "error" && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-full border border-rose-100/50 animate-in fade-in duration-300">
                <AlertCircle className="w-3.5 h-3.5" /> Error saving changes
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Editor Content Area */}
      <div className="max-w-[1440px] w-full mx-auto px-6 sm:px-8 py-8 flex flex-col xl:flex-row gap-8">
        
        {/* Main Form Area */}
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          {/* Horizontal Tab Nav Row */}
          <div className="flex items-center gap-6 border-b border-zinc-200">
            {tabs.map((t) => {
              const active = activeTab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTab(t.id)
                    setSaveStatus("idle")
                  }}
                  className={cn(
                    "pb-3 text-[14px] transition-all duration-200 focus:outline-none flex items-center gap-2 relative",
                    active
                      ? "border-b-2 border-[var(--color-brand)] text-[var(--color-brand)] font-semibold"
                      : "text-zinc-500 hover:text-zinc-700 font-medium"
                  )}
                >
                  <span>{t.label}</span>
                  {t.count > 0 && (
                    <span className="text-[9px] font-bold bg-[var(--color-brand)] text-white px-1.5 py-0.5 rounded-full leading-none shrink-0">
                      {t.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Tab view containers */}
          <div className="bg-white rounded-3xl border border-zinc-200/60 p-5 md:p-7 shadow-sm min-h-[500px]">
            {activeTab === "basic" && (
              <BasicInfoTab
                item={item}
                saving={saving}
                onSave={handleSaveBasicInfo}
              />
            )}

            {activeTab === "photos" && (
              <PhotosTab
                item={item}
                onRefetch={fetchItem}
              />
            )}

            {activeTab === "variants" && (
              <VariantsTab
                item={item}
                attachedVariants={attachedVariants}
                setAttachedVariants={setAttachedVariants}
                initialVariants={item.variants || []}
                onRefetch={fetchItem}
              />
            )}

            {activeTab === "customizations" && (
              <CustomizationsTab
                item={item}
                attachedGroups={attachedGroups}
                setAttachedGroups={setAttachedGroups}
                initialGroups={item.optionGroups || []}
                onRefetch={fetchItem}
              />
            )}
          </div>
        </div>

        {/* Live Storefront Preview (Clean design card) */}
        <div className="w-full xl:w-[400px] shrink-0 sticky top-28 self-start">
          <div className="bg-white rounded-3xl border border-zinc-200/60 p-5 shadow-sm">
            <h3 className="text-[12px] font-semibold text-zinc-500 mb-4">Storefront Live Preview</h3>
            <LiveStorefrontPreview 
              item={item} 
              attachedVariants={attachedVariants}
              attachedGroups={attachedGroups}
            />
          </div>
        </div>

      </div>
    </div>
  )
}
