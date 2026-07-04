"use client"

import { Loader2 } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface ConfirmModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  loading: boolean
  onConfirm: () => void
}

export function ConfirmModal({ open, onOpenChange, title, description, loading, onConfirm }: ConfirmModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-zinc-950">{title}</DialogTitle>
          <DialogDescription className="text-zinc-400 text-xs leading-relaxed mt-2">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 px-8 pt-4">
          <Button onClick={() => onOpenChange(false)} className="flex-1 bg-rose-500 hover:bg-rose-600 text-white">
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={loading} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white">
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Processing...
              </>
            ) : (
              "Confirm"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
