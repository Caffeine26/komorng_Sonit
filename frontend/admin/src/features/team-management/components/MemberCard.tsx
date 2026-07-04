"use client";

import React, { useState } from "react";
import { 
  Mail, 
  Shield, 
  Trash2, 
  UserCircle,
  Send,
  Clock,
  Copy,
  Check,
  Edit2
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface TeamMember {
  id: string;
  name: string;
  email?: string;
  telegramUsername?: string;
  role: "TENANT_OWNER" | "TENANT_MANAGER" | "SERVICE_STAFF";
  status: "ACTIVE" | "INACTIVE";
  joinedDate: string;
  avatarUrl?: string;
}

export interface PendingInvite {
  id: string;
  name: string;
  telegramUsername: string;
  email?: string;
  role: "TENANT_OWNER" | "TENANT_MANAGER" | "SERVICE_STAFF";
  status: "PENDING" | "EXPIRED";
  expiresAt: string;
  inviteUrl: string;
}

interface MemberCardProps {
  member?: TeamMember;
  invite?: PendingInvite;
  onDelete?: (id: string) => void;
  onRevoke?: (id: string) => void;
  onEdit?: (member: TeamMember) => void;
}

export const MemberCard = ({ member, invite, onDelete, onRevoke, onEdit }: MemberCardProps) => {
  const [copied, setCopied] = useState(false);

  const roleLabels: Record<string, string> = {
    TENANT_OWNER: "Restaurant Owner",
    TENANT_MANAGER: "Manager",
    SERVICE_STAFF: "Service Staff",
  };

  const statusColors = {
    ACTIVE: "bg-emerald-500",
    INACTIVE: "bg-zinc-300",
    PENDING: "bg-amber-400",
    EXPIRED: "bg-rose-500",
  };

  const isInvite = !!invite;
  const displayName = isInvite ? invite.name : member?.name || "No Name";
  const email = isInvite ? invite.email : member?.email;
  const telegramUsername = isInvite ? invite.telegramUsername : member?.telegramUsername;
  const role = isInvite ? invite.role : member?.role || "SERVICE_STAFF";
  const status = isInvite ? invite.status : member?.status || "ACTIVE";
  const id = isInvite ? invite.id : member?.id || "";

  const handleCopyLink = async () => {
    if (invite?.inviteUrl) {
      try {
        await navigator.clipboard.writeText(invite.inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy link:", err);
      }
    }
  };

  return (
    <div className="group bg-white/80 backdrop-blur-sm border border-zinc-100/50 rounded-[32px] p-6 transition-all duration-500 hover:border-primary/20 hover:shadow-[0_20px_50px_rgba(233,30,99,0.06)] relative overflow-hidden animate-ui-entry">
      
      {/* Brand Glow Ambient Effect */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/5 rounded-full blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

      <div className="flex flex-col h-full relative z-10">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-14 h-14 rounded-2xl overflow-hidden bg-zinc-50 border border-zinc-100/50 flex items-center justify-center transition-all duration-500",
              isInvite ? "text-amber-500 bg-amber-50/50" : "text-zinc-300 group-hover:text-primary group-hover:bg-primary/5 group-hover:border-primary/10"
            )}>
              {!isInvite && member?.avatarUrl ? (
                <img 
                  src={member.avatarUrl} 
                  alt={displayName} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserCircle size={30} strokeWidth={1.2} />
              )}
            </div>
            <div>
              <h3 className="text-[16px] font-medium text-zinc-950 tracking-tight leading-tight truncate max-w-[150px]">{displayName}</h3>
              <div className="flex items-center gap-1.5 mt-1.5">
                <div className={cn("w-1.5 h-1.5 rounded-full", statusColors[status])} />
                <span className="text-[11px] font-medium text-zinc-400 tracking-wide capitalize">{status.toLowerCase()}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            {isInvite ? (
              <>
                <button 
                  onClick={handleCopyLink}
                  title="Copy deep-link"
                  className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center border transition-all cursor-pointer",
                    copied 
                      ? "border-emerald-200 bg-emerald-50 text-emerald-600" 
                      : "border-zinc-100/50 text-zinc-400 hover:text-primary hover:bg-primary/5 hover:border-primary/20"
                  )}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
                {onRevoke && (
                  <button 
                    onClick={() => onRevoke(id)}
                    title="Cancel Invitation"
                    className="w-9 h-9 rounded-xl flex items-center justify-center border border-zinc-100/50 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 hover:border-rose-200 transition-all cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </>
            ) : (
              <div className="flex items-center gap-1">
                {onEdit && role !== "TENANT_OWNER" && (
                  <button 
                    onClick={() => onEdit(member!)}
                    title="Edit team member"
                    className="w-9 h-9 rounded-xl flex items-center justify-center border border-zinc-100/50 text-zinc-400 hover:text-primary hover:bg-primary/5 hover:border-primary/20 transition-all cursor-pointer"
                  >
                    <Edit2 size={14} />
                  </button>
                )}
                {onDelete && role !== "TENANT_OWNER" && (
                  <button 
                    onClick={() => onDelete(id)}
                    title="Remove from team"
                    className="w-9 h-9 rounded-xl flex items-center justify-center border border-zinc-100/50 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 hover:border-rose-200 transition-all cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 flex-1">
          {email && (
            <div className="flex items-center gap-3.5 group/link cursor-default">
              <div className="w-8 h-8 rounded-lg bg-zinc-50 flex items-center justify-center text-zinc-400 group-hover/link:text-primary transition-colors">
                <Mail size={14} />
              </div>
              <span className="text-[13px] font-normal text-zinc-500 truncate">{email}</span>
            </div>
          )}
          
          {telegramUsername && (
            <div className="flex items-center gap-3.5 group/link cursor-default">
              <div className="w-8 h-8 rounded-lg bg-zinc-50 flex items-center justify-center text-zinc-400 group-hover/link:text-primary transition-colors">
                <Send size={14} />
              </div>
              <span className="text-[13px] font-normal text-zinc-500 truncate">@{telegramUsername}</span>
            </div>
          )}

          <div className="flex items-center gap-3.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-50 flex items-center justify-center text-zinc-400">
              <Shield size={14} />
            </div>
            <span className="text-[13px] font-medium text-zinc-700">{roleLabels[role] || role}</span>
          </div>
        </div>

        <div className="pt-5 mt-6 border-t border-zinc-50/80 flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-400">
            <Clock size={12} />
            <span className="text-[11px] font-normal tracking-tight">
              {isInvite 
                ? `Expires ${new Date(invite.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` 
                : `Joined ${member?.joinedDate}`}
            </span>
          </div>
          <div className={cn(
            "w-2 h-2 rounded-full transition-colors", 
            isInvite ? "bg-amber-100 group-hover:bg-amber-300" : "bg-zinc-100 group-hover:bg-primary/20"
          )} />
        </div>
      </div>
    </div>
  );
};
