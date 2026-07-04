import { useState, useCallback } from "react";
import { 
  getAdminTeamOverview, 
  inviteAdminTeamMember, 
  revokeAdminInvitation, 
  removeAdminTeamMember, 
  updateAdminTeamMember 
} from "@/lib/api/team";
import { TeamMember, PendingInvite } from "../components/MemberCard";

export function useTeam(tenantSlug: string) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTeamData = useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    try {
      const data = await getAdminTeamOverview(tenantSlug);
      setMembers(data.members as any);
      setPendingInvites(data.pendingInvites as any);
    } catch (err) {
      console.error("Failed to load team data:", err);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  const inviteMember = async (data: any) => {
    await inviteAdminTeamMember(data, tenantSlug);
    await fetchTeamData();
  };

  const updateMember = async (id: string, data: any) => {
    await updateAdminTeamMember(id, data, tenantSlug);
    await fetchTeamData();
  };

  const removeMember = async (id: string) => {
    await removeAdminTeamMember(id, tenantSlug);
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const revokeInvitation = async (id: string) => {
    await revokeAdminInvitation(id, tenantSlug);
    setPendingInvites((prev) => prev.filter((i) => i.id !== id));
  };

  return {
    members,
    pendingInvites,
    loading,
    fetchTeamData,
    inviteMember,
    updateMember,
    removeMember,
    revokeInvitation,
  };
}
