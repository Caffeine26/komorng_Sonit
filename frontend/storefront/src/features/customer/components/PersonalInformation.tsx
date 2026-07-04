"use client";

import React, { useState, useEffect } from "react";
import { Phone, CalendarDays, ChevronRight, Loader2, Check } from "lucide-react";
import { motion, Variants, AnimatePresence } from "framer-motion";
import { useParams } from "next/navigation";
import { useAuth } from "@/features/customer/hooks/useAuth";
import { apiFetch } from "@/lib/api/client";
import { useTranslation } from "@/lib/i18n";

interface PersonalInformationProps {
  itemVariants?: Variants;
}

export function PersonalInformation({ itemVariants }: PersonalInformationProps) {
  const { tenantSlug } = useParams() as { tenantSlug: string };
  const { isLoggedIn } = useAuth();
  const { t } = useTranslation();
  
  const [phone, setPhone] = useState<string>("");
  const [dob, setDob] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [editingField, setEditingField] = useState<"phone" | "dob" | null>(null);
  const [tempValue, setTempValue] = useState<string>("");

  useEffect(() => {
    if (!isLoggedIn) return;

    let timeoutId: NodeJS.Timeout;

    async function fetchProfile() {
      try {
        const data = await apiFetch<any>(`/api/v1/storefront/profile`, {
          headers: { 'x-tenant-slug': tenantSlug },
        });
        setPhone(data.phoneNumber || "");
        if (data.dateOfBirth) {
          setDob(data.dateOfBirth.split("T")[0]); // YYYY-MM-DD
        }

        // If phone number is empty, the user might be sharing it via Telegram.
        // Poll every 3 seconds until it populates.
        if (!data.phoneNumber) {
          timeoutId = setTimeout(fetchProfile, 3000);
        }
      } catch (error) {
        console.error("Failed to fetch profile", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchProfile();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isLoggedIn, tenantSlug]);

  const handleSave = async () => {
    setIsSaving(true);
    const updatedPhone = editingField === "phone" ? tempValue : phone;
    const updatedDob = editingField === "dob" ? tempValue : dob;

    try {
      await apiFetch(`/api/v1/storefront/profile`, {
        method: 'PATCH',
        headers: {
          'x-tenant-slug': tenantSlug,
        },
        body: {
          phoneNumber: updatedPhone || null,
          dateOfBirth: updatedDob ? new Date(updatedDob).toISOString() : null,
        },
      });

      if (editingField === "phone") setPhone(tempValue);
      if (editingField === "dob") setDob(tempValue);
      setEditingField(null);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isLoggedIn) return null;

  const content = (
    <div className="bg-white/60 backdrop-blur-[32px] border border-white shadow-[0_14px_30px_rgba(0,0,0,0.03)] rounded-[32px] p-2 overflow-hidden w-full max-w-[320px]">
      <div className="px-4 pt-4 pb-2">
        <h3 className="font-jakarta font-black text-[16px] text-zinc-900 tracking-tight">
          {t("profile.personalInfo")}
        </h3>
      </div>
      <div className="flex flex-col">
        {/* Phone Number */}
        <div className="flex flex-col">
          <button 
            onClick={() => {
              if (editingField === "phone") {
                setEditingField(null);
              } else {
                setTempValue(phone);
                setEditingField("phone");
              }
            }}
            className="w-full flex items-center justify-between p-4 rounded-[24px] hover:bg-white/60 active:bg-zinc-100/50 transition-colors group min-h-[44px]"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-zinc-100/80 flex items-center justify-center text-zinc-500 group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                <Phone size={18} strokeWidth={2} />
              </div>
              <span className="font-medium text-[15px] text-zinc-700">{t("profile.phone")}</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-400">
              {!editingField && (
                <span className="text-[14px] font-medium text-zinc-500 max-w-[100px] truncate">
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : (phone || "Not set")}
                </span>
              )}
              <ChevronRight
                size={18}
                strokeWidth={2}
                className={`transition-transform ${editingField === "phone" ? "rotate-90" : "group-hover:translate-x-0.5"}`}
              />
            </div>
          </button>

          <AnimatePresence>
            {editingField === "phone" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden px-4 pb-4"
              >
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="tel"
                    value={tempValue}
                    onChange={(e) => setTempValue(e.target.value)}
                    placeholder="e.g. 012345678"
                    className="flex-1 h-[44px] rounded-[16px] bg-white border border-zinc-200 px-4 text-[14px] outline-none focus:border-primary transition-colors shadow-sm"
                    autoFocus
                  />
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="h-[44px] px-4 rounded-[16px] bg-primary text-white font-bold flex items-center justify-center active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} strokeWidth={3} />}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="h-[1px] w-[calc(100%-32px)] mx-auto bg-zinc-100" />

        {/* Date of Birth */}
        <div className="flex flex-col">
          <button 
            onClick={() => {
              if (editingField === "dob") {
                setEditingField(null);
              } else {
                setTempValue(dob);
                setEditingField("dob");
              }
            }}
            className="w-full flex items-center justify-between p-4 rounded-[24px] hover:bg-white/60 active:bg-zinc-100/50 transition-colors group min-h-[44px]"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-zinc-100/80 flex items-center justify-center text-zinc-500 group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                <CalendarDays size={18} strokeWidth={2} />
              </div>
              <span className="font-medium text-[15px] text-zinc-700">{t("profile.dateOfBirth")}</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-400">
              {!editingField && (
                <span className="text-[14px] font-medium text-zinc-500 max-w-[100px] truncate">
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : (dob || "Not set")}
                </span>
              )}
              <ChevronRight
                size={18}
                strokeWidth={2}
                className={`transition-transform ${editingField === "dob" ? "rotate-90" : "group-hover:translate-x-0.5"}`}
              />
            </div>
          </button>

          <AnimatePresence>
            {editingField === "dob" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden px-4 pb-4"
              >
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="date"
                    value={tempValue}
                    onChange={(e) => setTempValue(e.target.value)}
                    className="flex-1 h-[44px] rounded-[16px] bg-white border border-zinc-200 px-4 text-[14px] outline-none focus:border-primary transition-colors shadow-sm"
                    autoFocus
                  />
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="h-[44px] px-4 rounded-[16px] bg-primary text-white font-bold flex items-center justify-center active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} strokeWidth={3} />}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );

  if (itemVariants) {
    return <motion.div variants={itemVariants}>{content}</motion.div>;
  }

  return content;
}
