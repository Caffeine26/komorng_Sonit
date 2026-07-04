"use client";

import React, { useState, useEffect } from "react";
import { X, User, Mail, Shield, CheckCircle2, Send } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useTranslations } from "next-intl";

interface MemberFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { fullName: string; telegramUsername: string; email?: string; role: string }) => void;
  editMember?: { id: string; name: string; email?: string; telegramUsername?: string; role: string } | null;
}

interface ModalInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  prefixNode?: React.ReactNode;
}

const ModalInput = ({ prefixNode, className, ...props }: ModalInputProps) => {
  return (
    <div className={cn(
      "flex items-center w-full h-14 bg-white border border-zinc-100 rounded-2xl px-6 shadow-sm transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/5",
      className
    )}>
      {prefixNode && (
        <div className="flex items-center justify-center shrink-0 text-zinc-400 mr-3">
          {prefixNode}
        </div>
      )}
      <input
        {...props}
        className="flex-1 w-full bg-transparent text-[14px] font-normal text-zinc-950 focus:outline-none disabled:text-zinc-500"
      />
    </div>
  );
};

const ModalLabel = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <label className={cn("text-[12px] font-medium text-zinc-400 tracking-wide block ml-6", className)}>
    {children}
  </label>
);

export const MemberFormModal = ({ isOpen, onClose, onSubmit, editMember }: MemberFormModalProps) => {
  const t = useTranslations("member_form");
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    telegramUsername: "",
    role: "SERVICE_STAFF",
  });

  const [errors, setErrors] = useState<{ telegramUsername?: string; fullName?: string }>({});

  useEffect(() => {
    if (isOpen) {
      if (editMember) {
        setFormData({
          fullName: editMember.name,
          email: editMember.email || "",
          telegramUsername: editMember.telegramUsername || "",
          role: editMember.role,
        });
      } else {
        setFormData({
          fullName: "",
          email: "",
          telegramUsername: "",
          role: "SERVICE_STAFF",
        });
      }
      setErrors({});
    }
  }, [isOpen, editMember]);

  if (!isOpen) return null;

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: typeof errors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = t('name_required');
    }

    const cleanTelegram = formData.telegramUsername.replace("@", "").trim();
    if (!cleanTelegram) {
      newErrors.telegramUsername = t('telegram_required');
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSubmit({
      fullName: formData.fullName.trim(),
      telegramUsername: cleanTelegram,
      email: formData.email.trim() || undefined,
      role: formData.role,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[var(--color-background-raised)]/80 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-[600px] max-h-[92vh] bg-white rounded-[32px] sm:rounded-[40px] shadow-[0_40px_100px_rgba(0,0,0,0.1)] border border-white overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">

        {/* Header */}
        <div className="h-16 sm:h-20 flex items-center justify-between px-6 sm:px-8 border-b border-zinc-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary">
              <User size={18} strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-[16px] sm:text-[18px] font-normal text-zinc-950 tracking-tight leading-none">
                {editMember ? t('edit_team_member') : t('invite_team_member')}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-400 hover:bg-zinc-50 transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-8 flex-1 overflow-y-auto custom-scrollbar">
          <form className="space-y-4 sm:space-y-6" onSubmit={handleSubmitForm}>

            {/* Inputs */}
            <div className="space-y-4">
              <div className="space-y-2">
                <ModalLabel className="ml-4 sm:ml-6">{t('full_name')}</ModalLabel>
                <ModalInput
                  required
                  prefixNode={<User size={18} />}
                  placeholder={t('name_placeholder')}
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                />
                {errors.fullName && <p className="text-xs text-rose-500 ml-6">{errors.fullName}</p>}
              </div>

              <div className="space-y-2">
                <ModalLabel className="ml-4 sm:ml-6">{t('telegram_username')} <span className="text-rose-500">*</span></ModalLabel>
                <ModalInput
                  required
                  disabled={!!editMember}
                  prefixNode={<Send size={18} />}
                  placeholder={t('telegram_placeholder')}
                  value={formData.telegramUsername}
                  onChange={(e) => setFormData({ ...formData, telegramUsername: e.target.value })}
                  className={cn(!!editMember && "bg-zinc-50/50 border-zinc-100/30 opacity-60 cursor-not-allowed")}
                />
                {errors.telegramUsername && <p className="text-xs text-rose-500 ml-6">{errors.telegramUsername}</p>}
                <p className="text-[11px] text-zinc-400 ml-6">
                  {editMember 
                    ? t('telegram_edit_desc') 
                    : t('telegram_create_desc')}
                </p>
              </div>

              <div className="space-y-2">
                <ModalLabel className="ml-4 sm:ml-6">{t('email')}</ModalLabel>
                <ModalInput
                  type="email"
                  prefixNode={<Mail size={18} />}
                  placeholder={t('email_placeholder')}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            {/* Access Roles */}
            <div className="pt-2 space-y-2">
              <ModalLabel className="ml-4">{t('access_role')}</ModalLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { id: "TENANT_MANAGER", label: t('manager_role'), desc: t('manager_desc') },
                  { id: "SERVICE_STAFF", label: t('service_role'), desc: t('service_desc') },
                ].map((role) => (
                  <div
                    key={role.id}
                    onClick={() => setFormData({ ...formData, role: role.id })}
                    className={cn(
                      "p-4 rounded-[24px] border transition-all cursor-pointer flex flex-col justify-between gap-3 min-h-[100px]",
                      formData.role === role.id
                        ? "border-primary bg-white ring-4 ring-primary/5"
                        : "border-zinc-100/50 bg-zinc-50/40 hover:border-zinc-200"
                    )}
                  >
                    <div>
                      <p className="text-[14px] font-medium text-zinc-950 leading-none">{role.label}</p>
                      <p className="text-[11px] text-zinc-400 mt-1">{role.desc}</p>
                    </div>
                    
                    <div className="flex justify-end">
                      <div className={cn(
                        "w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all duration-300 flex-shrink-0",
                        formData.role === role.id 
                          ? "border-primary bg-primary" 
                          : "border-zinc-200 bg-white"
                      )}>
                        {formData.role === role.id && <CheckCircle2 size={12} className="text-white" />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 sm:pt-6 flex items-center justify-center gap-3 sm:gap-4 mt-4">
              <button
                type="button"
                onClick={onClose}
                className="h-12 sm:h-14 px-8 sm:px-10 bg-zinc-50/50 text-zinc-950 rounded-[24px] sm:rounded-[28px] text-[13px] sm:text-[14px] font-normal hover:bg-zinc-100 transition-all cursor-pointer min-w-[140px]"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                className="h-12 sm:h-14 px-8 sm:px-10 bg-primary text-white rounded-[24px] sm:rounded-[28px] text-[13px] sm:text-[14px] font-normal hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-primary/20 min-w-[140px]"
              >
                {editMember ? t('save_changes') : t('send_invite')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};