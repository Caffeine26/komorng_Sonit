"use client"

import { useState, useRef } from "react"
import { Image as ImageIcon, Upload, Star, Trash2, Loader2 } from "lucide-react"
import { useImages } from "../../../../hooks/useImages"
import { MenuItem, MenuItemImage } from "../../../../types"
import { cn } from "@/lib/utils/cn"
import { ConfirmModal } from "../../shared/ConfirmModal"

interface PhotosTabProps {
  item: MenuItem
  onRefetch: () => void
}

export function PhotosTab({ item, onRefetch }: PhotosTabProps) {
  const { uploadImage, setPrimaryImage, deleteImage } = useImages()
  
  const [uploading, setUploading] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)
  
  // Confirmation states
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const images = item.images || []

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
  }

  async function handleSetPrimary(img: MenuItemImage) {
    if (img.isPrimary || actingId) return
    setActingId(img.id)
    try {
      await setPrimaryImage(item.id, img.id, images)
      onRefetch()
    } catch (err) {
      console.error(err)
    } finally {
      setActingId(null)
    }
  }

  async function handleDelete() {
    if (!deleteTargetId) return
    setDeleting(true)
    try {
      await deleteImage(item.id, deleteTargetId)
      onRefetch()
    } catch (err) {
      console.error(err)
    } finally {
      setDeleting(false)
      setDeleteTargetId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[18px] font-normal text-zinc-950 tracking-tight leading-none mb-1">Product Gallery</h2>
        <p className="text-[12px] text-zinc-400 font-medium">Upload photos. The primary photo is displayed in search results and customer catalog.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pt-4 border-t border-zinc-100">
        
        {/* Dropzone/Upload Button */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
        
        <div
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={cn(
            "aspect-square border-2 border-dashed border-zinc-200/80 bg-zinc-50/20 hover:bg-zinc-50 hover:border-primary/40 rounded-2xl flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-colors shadow-inner select-none",
            uploading && "pointer-events-none opacity-60"
          )}
        >
          {uploading ? (
            <Loader2 className="w-6 h-6 animate-spin text-primary mb-2" />
          ) : (
            <Upload className="w-6 h-6 text-zinc-400 mb-2" />
          )}
          <span className="text-[12px] font-medium text-zinc-650">
            {uploading ? "Uploading..." : "Upload Photo"}
          </span>
          <span className="text-[10px] text-zinc-400 mt-1">PNG, JPG up to 5MB</span>
        </div>

        {/* Existing Images */}
        {images.map((img) => {
          const loading = actingId === img.id
          return (
            <div
              key={img.id}
              className={cn(
                "relative aspect-square rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-50 group shadow-sm transition-all duration-300",
                img.isPrimary && "ring-2 ring-primary ring-offset-2"
              )}
            >
              <img src={img.imageUrl} className="w-full h-full object-cover" alt="Product" />

              {/* Action Overlays */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2">
                
                {/* Primary toggle */}
                <button
                  onClick={() => handleSetPrimary(img)}
                  disabled={loading || img.isPrimary}
                  className={cn(
                    "p-2 rounded-xl bg-white hover:bg-zinc-100 text-zinc-700 hover:text-amber-500 shadow-md transition-colors cursor-pointer",
                    img.isPrimary && "text-amber-500 hover:bg-white"
                  )}
                  title={img.isPrimary ? "Primary Image" : "Set as Primary"}
                >
                  <Star className="w-4 h-4 fill-current" />
                </button>

                 {/* Delete button */}
                <button
                  onClick={() => setDeleteTargetId(img.id)}
                  disabled={loading}
                  className="p-2 rounded-xl bg-white hover:bg-rose-50 text-zinc-700 hover:text-rose-500 shadow-md transition-colors cursor-pointer"
                  title="Delete Photo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Badges for status */}
              {img.isPrimary && (
                <div className="absolute top-3 left-3 bg-primary text-white text-[9px] font-boldtracking-wider px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                  <Star className="w-2.5 h-2.5 fill-current" /> Primary
                </div>
              )}

              {/* Loading spinner */}
              {loading && (
                <div className="absolute inset-0 bg-black/35 backdrop-blur-xs flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                </div>
              )}

            </div>
          )
        })}

      </div>

      {/* Confirm Photo Upload */}
      <ConfirmModal
        open={!!pendingFile}
        onOpenChange={(open) => !open && setPendingFile(null)}
        title="Confirm Photo Upload"
        description={pendingFile ? `Are you sure you want to add "${pendingFile.name}" to this product's gallery?` : ""}
        loading={uploading}
        onConfirm={async () => {
          if (!pendingFile) return
          setUploading(true)
          try {
            await uploadImage(item.id, pendingFile)
            onRefetch()
            setPendingFile(null)
          } catch (err) {
            console.error(err)
            alert("Failed to upload image")
          } finally {
            setUploading(false)
          }
        }}
      />

      {/* Confirm Photo Delete */}
      <ConfirmModal
        open={!!deleteTargetId}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
        title="Delete Photo?"
        description="Are you sure you want to permanently delete this photo from the gallery?"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  )
}
