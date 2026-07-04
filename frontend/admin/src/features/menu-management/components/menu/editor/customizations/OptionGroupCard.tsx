"use client"

import { useState } from "react"
import { GripVertical, Pencil, Trash2, Plus, Sliders } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusPill } from "../../shared/StatusPill"
import { ConfirmModal } from "../../shared/ConfirmModal"
import { OptionFormModal } from "./OptionFormModal"
import { useOptionGroups } from "../../../../hooks/useOptionGroups"
import { useOptions } from "../../../../hooks/useOptions"
import { MenuItem, MenuItemOptionGroup, MenuItemOption } from "../../../../types"

interface OptionGroupCardProps {
  item: MenuItem
  group: MenuItemOptionGroup
  onEditGroup: () => void
  onRefetch: () => void
}

export function OptionGroupCard({ item, group, onEditGroup, onRefetch }: OptionGroupCardProps) {
  const { deleteOptionGroup } = useOptionGroups()
  const { deleteOption, updateOption } = useOptions()

  const [isOptionFormOpen, setIsOptionFormOpen] = useState(false)
  const [editingOption, setEditingOption] = useState<MenuItemOption | null>(null)

  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState(false)
  const [deletingGroup, setDeletingGroup] = useState(false)

  const [deleteOptionTarget, setDeleteOptionTarget] = useState<MenuItemOption | null>(null)
  const [deletingOption, setDeletingOption] = useState(false)

  const options = group.options || []

  async function handleDeleteGroup() {
    setDeletingGroup(true)
    try {
      await deleteOptionGroup(item.id, group.id)
      onRefetch()
    } catch (err) {
      console.error(err)
    } finally {
      setDeletingGroup(false)
      setDeleteGroupConfirm(false)
    }
  }

  async function handleDeleteOption() {
    if (!deleteOptionTarget) return
    setDeletingOption(true)
    try {
      await deleteOption(item.id, group.id, deleteOptionTarget.id)
      onRefetch()
    } catch (err) {
      console.error(err)
    } finally {
      setDeletingOption(false)
      setDeleteOptionTarget(null)
    }
  }

  async function handleToggleOptionStatus(opt: MenuItemOption, newValue: boolean) {
    try {
      await updateOption(item.id, group.id, opt.id, { isAvailable: newValue })
      onRefetch()
    } catch (err) {
      console.error(err)
    }
  }

  function handleStartAddOption() {
    setEditingOption(null)
    setIsOptionFormOpen(true)
  }

  function handleStartEditOption(opt: MenuItemOption) {
    setEditingOption(opt)
    setIsOptionFormOpen(true)
  }

  return (
    <>
      <div className="border border-zinc-200 rounded-[28px] overflow-hidden bg-white shadow-sm hover:shadow-[0_4px_20px_rgba(0,0,0,0.02)] transition-shadow">
        
        {/* Card Header */}
        <div className="bg-zinc-50/50 border-b border-zinc-150 px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <GripVertical className="w-4 h-4 text-zinc-300 cursor-grab" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-semibold text-zinc-900 leading-none">{group.nameEn}</h3>
                {group.nameKm && <span className="text-[12px] text-zinc-400 font-normal">({group.nameKm})</span>}
              </div>
              <p className="text-[11px] text-zinc-400 mt-1 font-medium">
                Rule: {group.minSelect === 0 ? "Optional" : `Required (Min ${group.minSelect})`} · Max selection: {group.maxSelect === 0 ? "Unlimited" : group.maxSelect}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={onEditGroup}
              className="h-8 px-2.5 text-[12px] text-zinc-650 hover:text-zinc-900 rounded-lg"
            >
              Edit Group
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteGroupConfirm(true)}
              className="h-8 px-2.5 text-[12px] text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
            >
              Delete
            </Button>
            <Button
              size="sm"
              onClick={handleStartAddOption}
              className="h-8 px-3 text-[11px] font-bold rounded-lg flex items-center gap-1"
            >
              <Plus size={14} /> Add Choice
            </Button>
          </div>
        </div>

        {/* Options Body */}
        <div className="p-4 bg-zinc-50/10">
          {options.length === 0 ? (
            <div className="text-center py-8 text-xs text-zinc-400 font-medium">
              No choices added to this group yet. Click "Add Choice" to begin.
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-200/50 bg-white overflow-hidden shadow-inner">
              {/* Table header */}
              <div className="grid grid-cols-[40px_1fr_120px_130px_100px] bg-zinc-50/30 border-b border-zinc-100 px-5 py-2.5">
                <div />
                <span className="text-[11px] font-bold text-zinc-400tracking-wider">Choice Name</span>
                <span className="text-[11px] font-bold text-zinc-400tracking-wider text-right">Price Extra</span>
                <span className="text-[11px] font-bold text-zinc-400tracking-wider pl-4">Status</span>
                <span className="text-[11px] font-bold text-zinc-400tracking-wider text-right pr-2">Actions</span>
              </div>

              {/* Rows */}
              <div className="divide-y divide-zinc-100">
                {options.map((opt) => (
                  <div
                    key={opt.id}
                    className="grid grid-cols-[40px_1fr_120px_130px_100px] items-center px-5 py-3 hover:bg-zinc-50/10 transition-colors"
                  >
                    <div className="flex items-center justify-center">
                      <GripVertical className="w-3.5 h-3.5 text-zinc-300" />
                    </div>

                    <div>
                      <span className="text-[13px] font-medium text-zinc-800">{opt.nameEn}</span>
                      {opt.nameKm && <span className="text-[11px] text-zinc-400 ml-1.5 font-normal">({opt.nameKm})</span>}
                    </div>

                    <span className="text-[13px] text-zinc-900 font-semibold text-right pr-2">
                      {opt.priceDeltaCents === 0 ? "Free" : `+$${(opt.priceDeltaCents / 100).toFixed(2)}`}
                    </span>

                    <StatusPill
                      value={opt.isAvailable}
                      labelTrue="Available"
                      labelFalse="Unavailable"
                      onToggle={(val) => handleToggleOptionStatus(opt, val)}
                    />

                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleStartEditOption(opt)}
                        className="p-1 rounded-md text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteOptionTarget(opt)}
                        className="p-1 rounded-md text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Delete Group Confirm */}
      <ConfirmModal
        open={deleteGroupConfirm}
        onOpenChange={setDeleteGroupConfirm}
        title={`Delete Group "${group.nameEn}"?`}
        description="Permanently delete this customization group and all of its choices. This action is irreversible."
        loading={deletingGroup}
        onConfirm={handleDeleteGroup}
      />

      {/* Delete Option Confirm */}
      <ConfirmModal
        open={!!deleteOptionTarget}
        onOpenChange={(open) => !open && setDeleteOptionTarget(null)}
        title={`Delete Choice "${deleteOptionTarget?.nameEn}"?`}
        description="Permanently remove this choice item from the customization group."
        loading={deletingOption}
        onConfirm={handleDeleteOption}
      />

      {/* Add/Edit Option Modal */}
      <OptionFormModal
        open={isOptionFormOpen}
        onOpenChange={setIsOptionFormOpen}
        menuItemId={item.id}
        groupId={group.id}
        editTarget={editingOption}
        onSuccess={() => {
          setIsOptionFormOpen(false)
          onRefetch()
        }}
      />
    </>
  )
}
