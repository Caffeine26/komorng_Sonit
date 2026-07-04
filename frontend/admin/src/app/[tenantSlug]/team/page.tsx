"use client";
import { useLocale } from "next-intl";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  Users, 
  Search, 
  RefreshCw,
  UserPlus,
  Clock,
  Send,
  Sparkles,
  Copy,
  Check,
  X
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { 
  MemberCard, 
  TeamMember, 
  PendingInvite,
  MemberFormModal,
  useTeam
} from "@/features/team-management";
import { GlobalActionDialog } from "@/components/ui/GlobalActionDialog";
import { useTenant } from "@/features/tenant/providers/TenantProvider";
import { useTranslations } from "next-intl";

export default function TeamPage() {
  const params = useParams();
  const tenantSlug = params?.tenantSlug as string;
  const locale = useLocale()
  const router = useRouter();
  const t = useTranslations("team");
  const { tenant, isLoading: isTenantLoading } = useTenant();

  useEffect(() => {
    if (!isTenantLoading && tenant) {
      const roles: string[] = (tenant as any)?.currentUser?.roles || [];
      const isOwnerOrManager = roles.includes('TENANT_OWNER') || roles.includes('TENANT_MANAGER') || roles.includes('PLATFORM_ADMIN');
      if (!isOwnerOrManager) {
        router.replace(`/${tenantSlug}/orders`);
      }
    }
  }, [tenant, isTenantLoading, locale, tenantSlug, router]);

  const roles: string[] = (tenant as any)?.currentUser?.roles || [];
  const isOwnerOrManager = roles.includes('TENANT_OWNER') || roles.includes('TENANT_MANAGER') || roles.includes('PLATFORM_ADMIN');

  const {
    members,
    pendingInvites,
    loading,
    fetchTeamData,
    inviteMember,
    updateMember,
    removeMember,
    revokeInvitation,
  } = useTeam(tenantSlug);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"ACTIVE" | "PENDING">("ACTIVE");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRevokeDialogOpen, setIsRevokeDialogOpen] = useState(false);

  const [memberToDelete, setMemberToDelete] = useState<string | null>(null);
  const [inviteToRevoke, setInviteToRevoke] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  
  const [dialogMsg, setDialogMsg] = useState<{ title: string, message: string } | null>(null);

  useEffect(() => {
    if (tenantSlug) {
      fetchTeamData();
    }
  }, [tenantSlug, fetchTeamData]);

  if (isTenantLoading || !isOwnerOrManager) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const handleOpenInviteModal = () => {
    setIsModalOpen(true);
  };

  const handleInviteSubmit = async (data: any) => {
    try {
      if (editingMember) {
        await updateMember(editingMember.id, {
          name: data.fullName,
          email: data.email,
          role: data.role
        });
        setIsModalOpen(false);
        setEditingMember(null);
      } else {
        await inviteMember(data);
        setIsModalOpen(false);
        setDialogMsg({ title: "Success", message: "Invitation successfully created and sent to staff member via Telegram Bot!" });
      }
    } catch (err: any) {
      setDialogMsg({ title: "Error", message: err.message || "Operation failed" });
    }
  };

  const handleEditClick = (member: TeamMember) => {
    setEditingMember(member);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    setMemberToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (memberToDelete) {
      try {
        await removeMember(memberToDelete);
      } catch (err: any) {
        setDialogMsg({ title: "Error", message: err.message || "Failed to remove member" });
      }
      setMemberToDelete(null);
    }
    setIsDeleteDialogOpen(false);
  };

  const handleRevokeClick = (id: string) => {
    setInviteToRevoke(id);
    setIsRevokeDialogOpen(true);
  };

  const confirmRevoke = async () => {
    if (inviteToRevoke) {
      try {
        await revokeInvitation(inviteToRevoke);
      } catch (err: any) {
        setDialogMsg({ title: "Error", message: err.message || "Failed to revoke invitation" });
      }
      setInviteToRevoke(null);
    }
    setIsRevokeDialogOpen(false);
  };

  // Filter lists based on search query
  const filteredMembers = members.filter(
    m => m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
         m.telegramUsername?.toLowerCase().includes(searchQuery.toLowerCase()) ||
         m.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredInvites = pendingInvites.filter(
    i => i.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
         i.telegramUsername.toLowerCase().includes(searchQuery.toLowerCase()) ||
         i.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-zinc-50/10 flex flex-col animate-ui-entry">
      
      {/* ── TOP BAR: Liquid Glass Layout ── */}
      <header className="py-6 sm:py-8 px-4 md:px-8 lg:px-10 flex flex-col lg:flex-row lg:items-center gap-6 justify-between flex-shrink-0 relative z-50 bg-zinc-50/10">
        <div className="flex flex-col">
          <h1 className="text-[24px] sm:text-[30px] font-medium text-zinc-950 tracking-tight leading-none">{t('title')}</h1>
          <p className="text-[13px] sm:text-[15px] font-normal text-zinc-400 mt-2">{t('desc')}</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 flex-1 w-full lg:w-auto lg:justify-end">
          <div className="relative w-full sm:w-72 group">
            <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-300 group-focus-within:text-primary transition-colors duration-300" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search')}
              className="w-full h-14 pl-14 pr-6 bg-white/80 backdrop-blur-sm border border-zinc-100/50 rounded-[22px] text-[14px] font-normal text-zinc-950 focus:outline-none focus:bg-white focus:border-primary/30 focus:ring-4 focus:ring-primary/5 transition-all duration-300 shadow-sm"
            />
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button 
              onClick={fetchTeamData}
              disabled={loading}
              className="w-14 h-14 bg-white/80 backdrop-blur-sm border border-zinc-100/50 rounded-[22px] flex items-center justify-center text-zinc-950 hover:bg-white hover:text-primary hover:border-primary/20 transition-all duration-300 shadow-sm cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={20} className={cn(loading && "animate-spin")} />
            </button>
            <button 
              onClick={handleOpenInviteModal}
              className="h-14 flex-1 sm:flex-none px-10 bg-primary text-white rounded-[22px] flex items-center justify-center gap-3 text-[14px] font-medium hover:opacity-90 active:scale-[0.96] transition-all duration-300 shadow-lg shadow-primary/20 cursor-pointer"
            >
              <UserPlus size={20} />
              <span>{t('invite')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="px-4 md:px-8 lg:px-10 flex gap-2 border-b border-zinc-100/50 pb-px">
        <button 
          onClick={() => setActiveTab("ACTIVE")}
          className={cn(
            "px-6 py-3.5 text-[14px] font-medium transition-all relative",
            activeTab === "ACTIVE" 
              ? "text-primary" 
              : "text-zinc-400 hover:text-zinc-600"
          )}
        >
          <span>{t('active_staff')} ({members.length})</span>
          {activeTab === "ACTIVE" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
          )}
        </button>
        <button 
          onClick={() => setActiveTab("PENDING")}
          className={cn(
            "px-6 py-3.5 text-[14px] font-medium transition-all relative flex items-center gap-2",
            activeTab === "PENDING" 
              ? "text-primary" 
              : "text-zinc-400 hover:text-zinc-600"
          )}
        >
          <span>{t('pending_invites')} ({pendingInvites.length})</span>
          {pendingInvites.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">
              {pendingInvites.length}
            </span>
          )}
          {activeTab === "PENDING" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
          )}
        </button>
      </div>

      <main className="flex-1 p-4 md:p-8 lg:p-10 pb-24 flex flex-col min-h-[calc(100vh-140px)]">
        
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <RefreshCw size={40} className="animate-spin text-primary" />
            <p className="text-[14px] text-zinc-400 mt-4">{t('loading')}</p>
          </div>
        ) : (
          <>
            {activeTab === "ACTIVE" && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                  {filteredMembers.map((member) => (
                    <MemberCard 
                      key={member.id}
                      member={member}
                      onDelete={handleDeleteClick}
                      onEdit={handleEditClick}
                    />
                  ))}
                </div>

                {filteredMembers.length === 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center py-20 text-center animate-ui-entry">
                    <div className="w-20 h-20 bg-zinc-50 rounded-[32px] flex items-center justify-center text-zinc-300 mb-6">
                      <Users size={32} />
                    </div>
                    <h3 className="text-[18px] font-normal text-zinc-950 tracking-tight">{t('no_active')}</h3>
                    <p className="text-[14px] font-normal text-zinc-400 mt-2 max-w-xs">{t('no_active_desc')}</p>
                  </div>
                )}
              </>
            )}

            {activeTab === "PENDING" && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                  {filteredInvites.map((invite) => (
                    <MemberCard 
                      key={invite.id}
                      invite={invite}
                      onRevoke={handleRevokeClick}
                    />
                  ))}
                </div>

                {filteredInvites.length === 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center py-20 text-center animate-ui-entry">
                    <div className="w-20 h-20 bg-zinc-50 rounded-[32px] flex items-center justify-center text-zinc-300 mb-6">
                      <Clock size={32} />
                    </div>
                    <h3 className="text-[18px] font-normal text-zinc-950 tracking-tight">{t('no_pending')}</h3>
                    <p className="text-[14px] font-normal text-zinc-400 mt-2 max-w-xs">{t('no_pending_desc')}</p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* Confirmation Dialogs */}
      <GlobalActionDialog 
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={confirmDelete}
        variant="DESTRUCTIVE"
        title={t('remove_title')}
        description={t('remove_desc')}
        confirmLabel={t('remove_btn')}
      />

      <GlobalActionDialog 
        isOpen={isRevokeDialogOpen}
        onClose={() => setIsRevokeDialogOpen(false)}
        onConfirm={confirmRevoke}
        variant="DESTRUCTIVE"
        title={t('revoke_title')}
        description={t('revoke_desc')}
        confirmLabel={t('revoke_btn')}
      />

      <GlobalActionDialog
        isOpen={!!dialogMsg}
        title={dialogMsg?.title || "Notice"}
        description={dialogMsg?.message || ""}
        confirmLabel="OK"
        onConfirm={() => setDialogMsg(null)}
        onCancel={() => setDialogMsg(null)}
        variant={dialogMsg?.title === "Error" ? "DESTRUCTIVE" : "PRIMARY"}
      />

      {/* Invite Member Drawer Form */}
      <MemberFormModal 
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingMember(null);
        }}
        onSubmit={handleInviteSubmit}
        editMember={editingMember}
      />


    </div>
  );
}
