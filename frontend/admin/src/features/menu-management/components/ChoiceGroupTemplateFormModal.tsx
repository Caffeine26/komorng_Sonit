"use client";

import React, { useState, useEffect, useRef } from "react";
import { Loader2, X, Plus, GripVertical, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createAdminMenuItem, updateAdminMenuItem } from "@/lib/api/menu";
import { useImages } from "../hooks/useImages";
import { GlobalActionDialog } from "@/components/ui/GlobalActionDialog";

function OptionImageUpload({ imageUrl, onUpload, onError }: { imageUrl?: string, onUpload: (file: File) => Promise<void>, onError: (msg: string) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setIsUploading(true)
      await onUpload(file)
    } catch (err) {
      console.error(err)
      onError("Failed to upload image")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <div 
      className="relative w-9 h-9 rounded-md border border-zinc-200 bg-white flex items-center justify-center shrink-0 overflow-hidden group cursor-pointer hover:border-[var(--color-brand)] transition-colors shadow-2xs"
      onClick={() => !isUploading && fileInputRef.current?.click()}
    >
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
      {isUploading ? (
        <Loader2 className="w-3.5 h-3.5 text-zinc-400 animate-spin" />
      ) : imageUrl ? (
        <>
          <img src={imageUrl} alt="Option" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <ImageIcon className="w-3.5 h-3.5 text-white" />
          </div>
        </>
      ) : (
        <ImageIcon className="w-4 h-4 text-zinc-400 group-hover:text-[var(--color-brand)] transition-colors" />
      )}
    </div>
  )
}

interface ChoiceGroupTemplateFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialData?: any | null;
  tenantSlug: string;
}

interface TemplateOptionRow {
  id?: string;
  nameEn: string;
  nameKm: string;
  price: string;
  imageUrl?: string;
  isAvailable?: boolean;
}

export const ChoiceGroupTemplateFormModal = ({ isOpen, onClose, onSuccess, initialData, tenantSlug }: ChoiceGroupTemplateFormModalProps) => {
  const [nameEn, setNameEn] = useState("");
  const [nameKm, setNameKm] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [isMultiple, setIsMultiple] = useState(false);
  const [maxSelectVal, setMaxSelectVal] = useState("");
  const [options, setOptions] = useState<TemplateOptionRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const { uploadImageFile } = useImages();

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setNameEn(initialData.nameEn || "");
        setNameKm(initialData.nameKm || "");
        
        const firstGroup = initialData.optionGroups?.[0] || {};
        setIsRequired(firstGroup.minSelect > 0);
        const mult = firstGroup.maxSelect > 1;
        setIsMultiple(mult);
        
        if (mult && firstGroup.maxSelect !== 10) {
          setMaxSelectVal(firstGroup.maxSelect ? firstGroup.maxSelect.toString() : "");
        } else {
          setMaxSelectVal("");
        }
        
        setOptions(firstGroup.options?.map((o: any) => ({
          id: o.id,
          nameEn: o.nameEn || "",
          nameKm: o.nameKm || "",
          price: o.priceDeltaCents ? (o.priceDeltaCents / 100).toFixed(2) : "0.00",
          imageUrl: o.imageUrl,
          isAvailable: o.isAvailable !== false
        })) || [{ nameEn: "", nameKm: "", price: "0.00", isAvailable: true }]);
      } else {
        setNameEn("");
        setNameKm("");
        setIsRequired(false);
        setIsMultiple(false);
        setMaxSelectVal("");
        setOptions([{ nameEn: "", nameKm: "", price: "0.00", isAvailable: true }]);
      }
    }
  }, [isOpen, initialData]);

  const addOption = () => {
    setOptions([...options, { nameEn: "", nameKm: "", price: "0.00" }]);
  };

  const removeOption = (index: number) => {
    if (options.length <= 1) return;
    setOptions(options.filter((_, i) => i !== index));
  };

  const updateOptionRow = (index: number, fields: Partial<TemplateOptionRow>) => {
    const updated = [...options];
    updated[index] = { ...updated[index], ...fields };
    setOptions(updated);
  };

  const handleSave = async () => {
    if (!nameEn) return setErrorMsg("Group name (English) is required.");
    if (options.length === 0) return setErrorMsg("Please add at least one option.");

    // Validate that at least one option name is filled
    const hasValidOption = options.some(o => o.nameEn.trim() !== "");
    if (!hasValidOption) return setErrorMsg("Please fill in at least one option name.");

    try {
      setIsSubmitting(true);

      const maxSelectNum = isMultiple 
        ? (maxSelectVal ? parseInt(maxSelectVal, 10) : 10) 
        : 1;

      const payload = {
        nameKm: nameKm || nameEn,
        nameEn,
        categoryId: null,
        descriptionEn: "GLOBAL_CHOICE_GROUP_TEMPLATE",
        descriptionKm: null,
        basePriceCents: 0,
        currency: "USD",
        isVisible: false,
        isAvailable: true,
        optionGroups: [
          {
            nameEn,
            nameKm: nameKm || nameEn,
            minSelect: isRequired ? 1 : 0,
            maxSelect: maxSelectNum,
            options: options.map((o, idx) => ({
              id: o.id || undefined,
              nameEn: o.nameEn || "Option",
              nameKm: o.nameKm || "",
              priceDeltaCents: Math.round(parseFloat(o.price || "0") * 100),
              imageUrl: o.imageUrl || undefined,
              isAvailable: o.isAvailable !== false,
              sortOrder: idx + 1
            }))
          }
        ]
      };

      if (initialData) {
        await updateAdminMenuItem("any", initialData.id, { ...payload, id: initialData.id } as any, tenantSlug);
      } else {
        await createAdminMenuItem("any", payload as any, tenantSlug);
      }

      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error("[ChoiceGroupTemplateForm] Save error:", error);
      setErrorMsg("Failed to save choice group: " + (error.message || "Unknown error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Computed Rule Preview Sentence
  const getRulePreviewText = () => {
    if (!isRequired && !isMultiple) {
      return (
        <span>
          Customer can optionally pick <strong className="font-semibold text-[var(--color-foreground)]">1 option</strong>.
        </span>
      );
    }
    if (isRequired && !isMultiple) {
      return (
        <span>
          Customer must pick <strong className="font-semibold text-[var(--color-foreground)]">exactly 1 option</strong>.
        </span>
      );
    }
    if (!isRequired && isMultiple) {
      if (maxSelectVal) {
        return (
          <span>
            Customer can optionally pick <strong className="font-semibold text-[var(--color-foreground)]">up to {maxSelectVal} options</strong>.
          </span>
        );
      } else {
        return (
          <span>
            Customer can optionally pick <strong className="font-semibold text-[var(--color-foreground)]">any number of options</strong>.
          </span>
        );
      }
    }
    if (isRequired && isMultiple) {
      if (maxSelectVal) {
        return (
          <span>
            Customer must pick <strong className="font-semibold text-[var(--color-foreground)]">at least 1, up to {maxSelectVal} options</strong>.
          </span>
        );
      } else {
        return (
          <span>
            Customer must pick <strong className="font-semibold text-[var(--color-foreground)]">at least 1 option</strong>.
          </span>
        );
      }
    }
    return null;
  };

  // Drag and Drop Event Handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // For transparent background on drag ghost
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = "0.4";
  };

  const handleDragEnd = (e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = "1";
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const list = [...options];
    const draggedItem = list[draggedIndex];
    list.splice(draggedIndex, 1);
    list.splice(index, 0, draggedItem);

    setOptions(list);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200"
      style={{
        "--border-radius-md": "8px",
        "--color-background-primary": "#ffffff",
        "--color-background-secondary": "var(--color-background-secondary)",
        "--color-border-secondary": "var(--color-border)",
        "--color-border-tertiary": "#f3f4f6",
        "--color-text-primary": "var(--color-foreground)",
        "--color-text-secondary": "#4b5563",
        "--color-text-tertiary": "#9ca3af",
      } as React.CSSProperties}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog container */}
      <div 
        className="relative w-full max-w-[800px] bg-white rounded-2xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.10)] border border-[#f3f4f6] flex flex-col animate-in zoom-in-[0.98] duration-200 max-h-[92vh]"
      >
        
        {/* HEADER */}
        <div className="px-6 pt-5 pb-[18px] border-b border-[#f3f4f6] flex items-start justify-between bg-white">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--color-foreground)] tracking-tight leading-none">
              {initialData ? "Edit option group" : "New option group"}
            </h2>
            <p className="text-[12px] text-[#9ca3af] mt-1.5 font-medium leading-none">
              Define a customization section like Add-ons or Sugar level.
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9ca3af] hover:bg-zinc-50 hover:text-zinc-900 transition-all focus:outline-none cursor-pointer"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* BODY */}
        <div className="p-6 flex flex-col gap-4 overflow-y-auto no-scrollbar flex-1 bg-white">
          
          {/* Two-column name row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-[#4b5563] flex items-center">
                Group name (English)
                <span className="text-[var(--color-brand)] ml-0.5">*</span>
              </label>
              <input
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Add-ons, Sugar level, Temperature"
                className="h-9 border border-[var(--color-border)] rounded-[var(--border-radius-md)] px-2.5 text-[13px] text-[var(--color-foreground)] bg-white outline-none w-full transition-all focus:border-[var(--color-brand)] focus:ring-[3px] focus:ring-[var(--color-brand)]/8"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-[#4b5563] flex items-center">
                Group name (Khmer)
                <span className="text-[10px] text-[#9ca3af] font-normal ml-1">(optional)</span>
              </label>
              <input
                value={nameKm}
                onChange={(e) => setNameKm(e.target.value)}
                placeholder="ឧ. បន្ថែម, កម្រិតស្ករ"
                className="h-9 border border-[var(--color-border)] rounded-[var(--border-radius-md)] px-2.5 text-[13px] text-[var(--color-foreground)] bg-white outline-none w-full transition-all focus:border-[var(--color-brand)] focus:ring-[3px] focus:ring-[var(--color-brand)]/8 font-khmer"
              />
            </div>
          </div>

          {/* Selection Rules Section */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-[#4b5563]">
              Selection rules
            </label>
            <div className="border border-[#f3f4f6] rounded-[var(--border-radius-md)] overflow-hidden bg-white">
              {/* Toggle 1: Required */}
              <div className="flex items-center justify-between p-3.5 bg-white">
                <div className="flex flex-col">
                  <span className="text-[12px] font-semibold text-[var(--color-foreground)]">Required</span>
                  <span className="text-[11px] text-[#9ca3af] mt-0.5">
                    Customer must pick at least one option before adding to cart
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRequired(!isRequired)}
                  className={cn(
                    "w-9 h-5 rounded-full relative transition-all duration-200 flex items-center p-0.5 cursor-pointer outline-none shrink-0",
                    isRequired ? "bg-[var(--color-brand)]" : "bg-zinc-200"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200",
                    isRequired ? "translate-x-4" : "translate-x-0"
                  )} />
                </button>
              </div>

              {/* Divider */}
              <div className="h-px bg-[#f3f4f6]" />

              {/* Toggle 2: Allow Multiple */}
              <div className="flex items-center justify-between p-3.5 bg-white">
                <div className="flex flex-col">
                  <span className="text-[12px] font-semibold text-[var(--color-foreground)]">Allow multiple selections</span>
                  <span className="text-[11px] text-[#9ca3af] mt-0.5">
                    Customer can pick more than one option from this group
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !isMultiple;
                    setIsMultiple(nextVal);
                    if (!nextVal) setMaxSelectVal("");
                  }}
                  className={cn(
                    "w-9 h-5 rounded-full relative transition-all duration-200 flex items-center p-0.5 cursor-pointer outline-none shrink-0",
                    isMultiple ? "bg-[var(--color-brand)]" : "bg-zinc-200"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200",
                    isMultiple ? "translate-x-4" : "translate-x-0"
                  )} />
                </button>
              </div>
            </div>
          </div>

          {/* Conditional Maximum Selections Field */}
          {isMultiple && (
            <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
              <label className="text-[11px] font-semibold text-[#4b5563]">
                Maximum selections
              </label>
              <input
                type="number"
                min={1}
                value={maxSelectVal}
                onChange={(e) => setMaxSelectVal(e.target.value)}
                placeholder="10"
                className="h-9 border border-[var(--color-border)] rounded-[var(--border-radius-md)] px-2.5 text-[13px] text-[var(--color-foreground)] bg-white outline-none w-[100px] transition-all focus:border-[var(--color-brand)] focus:ring-[3px] focus:ring-[var(--color-brand)]/8"
              />
              <span className="text-[11px] text-[#9ca3af]">
                Leave blank for unlimited
              </span>
            </div>
          )}

          {/* Live rule preview box */}
          <div className="bg-[var(--color-background-secondary)] border border-[#f3f4f6] rounded-[var(--border-radius-md)] p-2.5 text-[11px] text-[#4b5563] leading-none">
            {getRulePreviewText()}
          </div>

          {/* Divider line */}
          <div className="h-px bg-[#f3f4f6] my-0.5" />

          {/* Options Section */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline">
                <span className="text-[12px] font-semibold text-[var(--color-foreground)]">Options</span>
                <span className="text-[11px] text-[#9ca3af] ml-1.5 font-normal">
                  — choices inside this group
                </span>
              </div>
              <button
                type="button"
                onClick={addOption}
                className="h-7 px-2.5 bg-transparent border border-[var(--color-border)] rounded-[var(--border-radius-md)] text-[11px] font-medium text-[#4b5563] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] transition-all focus:outline-none cursor-pointer"
              >
                + Add option
              </button>
            </div>

            {/* List */}
            <div className="flex flex-col gap-4 mt-2">
              {options.map((opt, index) => {
                const isEmpty = !opt.nameEn && !opt.nameKm && (!opt.price || opt.price === "0.00");
                return (
                  <div
                    key={index}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    className={cn(
                      "bg-white border rounded-[16px] overflow-hidden shadow-sm transition-all duration-200",
                      isEmpty 
                        ? "border-[var(--color-border)] opacity-80" 
                        : "border-[var(--color-border)]",
                      dragOverIndex === index && "border-[var(--color-brand)]"
                    )}
                  >
                    {/* Header */}
                    <div className="bg-zinc-50/80 border-b border-zinc-100 p-3 flex items-center justify-between cursor-grab" title="Drag to reorder">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-zinc-200 text-[11px] font-bold text-zinc-600 flex items-center justify-center">
                          {index + 1}
                        </div>
                        <span className="text-[14px] font-bold text-zinc-700">Option {index + 1}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <GripVertical size={16} className="text-zinc-400" />
                        {options.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeOption(index)}
                            className="p-1 rounded-md text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 transition-all cursor-pointer shrink-0"
                          >
                            <X size={14} strokeWidth={2.5} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Body */}
                    <div className="p-4 flex flex-col gap-4">
                      {/* Row 1: Names */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold text-[#4b5563] flex items-center">
                            Option name (English) <span className="text-[var(--color-brand)] ml-0.5">*</span> 
                          </label>
                          <input
                            value={opt.nameEn}
                            onChange={(e) => updateOptionRow(index, { nameEn: e.target.value })}
                            placeholder="e.g. Boba, Extra shot"
                            className="h-9 border border-[var(--color-border)] rounded-[var(--border-radius-md)] px-2.5 text-[13px] text-[var(--color-foreground)] bg-white outline-none w-full transition-all focus:border-[var(--color-brand)] focus:ring-[3px] focus:ring-[var(--color-brand)]/8"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold text-[#4b5563] flex items-center">
                            Option name (Khmer)
                            <span className="text-[10px] text-[#9ca3af] font-normal ml-1">(optional)</span>
                          </label>
                          <input
                            value={opt.nameKm}
                            onChange={(e) => updateOptionRow(index, { nameKm: e.target.value })}
                            placeholder="ឧ. បូបា"
                            className="h-9 border border-[var(--color-border)] rounded-[var(--border-radius-md)] px-2.5 text-[13px] text-[var(--color-foreground)] bg-white outline-none w-full transition-all focus:border-[var(--color-brand)] focus:ring-[3px] focus:ring-[var(--color-brand)]/8 font-khmer"
                          />
                        </div>
                      </div>

                      {/* Row 2: Price and Availability Grid */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold text-[#4b5563] flex items-center">
                            Price delta <span className="text-[var(--color-brand)] ml-0.5">*</span> 
                          </label>
                          <div className="flex flex-row h-9 border border-[var(--color-border)] rounded-[var(--border-radius-md)] overflow-hidden focus-within:border-[var(--color-brand)] focus-within:ring-[3px] focus-within:ring-[var(--color-brand)]/8 transition-all bg-white">
                            <span className="h-9 leading-9 px-2.5 text-[12px] font-semibold text-[#9ca3af] select-none border-r border-[var(--color-border)] bg-[var(--color-background-secondary)]">
                              $
                            </span>
                            <input
                              type="text"
                              value={opt.price}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === "" || val === "-" || /^-?\d*\.?\d*$/.test(val)) {
                                  updateOptionRow(index, { price: val });
                                }
                              }}
                              placeholder="0.00"
                              className="flex-1 h-9 border-none px-2.5 text-[13px] text-[var(--color-foreground)] bg-transparent outline-none w-full font-semibold"
                            />
                          </div>
                          <span className="text-[11px] font-medium text-[#9ca3af] block">{!opt.price || opt.price === "0.00" ? "No extra charge" : "Price will be added"}</span>
                        </div>
                        
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold text-[#4b5563] flex items-center">
                            Availability 
                          </label>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[13px] font-semibold text-[var(--color-foreground)]">Available</span>
                            <button
                              type="button"
                              onClick={() => updateOptionRow(index, { isAvailable: !opt.isAvailable })}
                              className={cn(
                                "w-9 h-5 rounded-full relative transition-all duration-200 flex items-center p-0.5 cursor-pointer outline-none shrink-0",
                                opt.isAvailable ? "bg-[#10B981]" : "bg-[var(--color-border)]"
                              )}
                            >
                              <div className={cn(
                                "w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200",
                                opt.isAvailable ? "translate-x-4" : "translate-x-0"
                              )} />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Row 3: Image Upload */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold text-[#4b5563] flex items-center">
                          Option Image 
                          <span className="text-[10px] text-[#9ca3af] font-normal ml-1">(optional)</span>
                        </label>
                        <div className="flex items-center gap-3 bg-[var(--color-background-secondary)] border border-[#f3f4f6] rounded-[var(--border-radius-md)] p-2">
                          <OptionImageUpload 
                            imageUrl={opt.imageUrl} 
                            onError={(msg) => setErrorMsg(msg)}
                            onUpload={async (file) => {
                              const url = await uploadImageFile(file)
                              if (url) {
                                updateOptionRow(index, { imageUrl: url })
                              }
                            }} 
                          />
                          <span className="text-[11px] font-medium text-[var(--color-muted)]">Upload a small circular thumbnail for the storefront preview</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* FOOTER */}
        <div className="px-6 py-3.5 border-t border-[#f3f4f6] flex items-center justify-end gap-2 bg-white">
          <button 
            type="button"
            onClick={onClose} 
            className="h-9 px-4 border border-[var(--color-border)] rounded-[var(--border-radius-md)] bg-transparent text-[#4b5563] hover:bg-zinc-50 font-medium text-[12px] transition-all cursor-pointer outline-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
            className="h-9 px-4.5 border-none rounded-[var(--border-radius-md)] bg-[var(--color-brand)] hover:bg-[#D4541A] text-white font-medium text-[12px] transition-all flex items-center justify-center gap-1.5 cursor-pointer outline-none shadow-sm disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={13} className="animate-spin text-white" />
                {initialData ? "Saving..." : "Creating..."}
              </>
            ) : (
              initialData ? "Save changes" : "Create group"
            )}
          </button>
        </div>

      </div>

      <GlobalActionDialog
        isOpen={!!errorMsg}
        title="Notice"
        description={errorMsg || ""}
        confirmLabel="OK"
        onConfirm={() => setErrorMsg(null)}
        onCancel={() => setErrorMsg(null)}
        variant="DESTRUCTIVE"
      />
    </div>
  );
};
