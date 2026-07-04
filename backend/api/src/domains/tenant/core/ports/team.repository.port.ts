export const TEAM_REPOSITORY_PORT = Symbol('TEAM_REPOSITORY_PORT');

export interface ITeamRepository {
  findRole(tenantId: string, userId: string): Promise<any | null>;
  findRoleByTelegramUsername(tenantId: string, username: string): Promise<any | null>;
  findManyRoles(tenantId: string): Promise<any[]>;
  createRole(tenantId: string, data: any): Promise<any>;
  updateRole(tenantId: string, userId: string, data: any): Promise<void>;
  updateUserAndRole(tenantId: string, userId: string, userData: any, roleData: any): Promise<void>;
  deleteRole(tenantId: string, userId: string): Promise<void>;

  findInvitationByEmail(tenantId: string, email: string): Promise<any | null>;
  findPendingInvitationByChannelId(tenantId: string, channelId: string): Promise<any | null>;
  findInvitationById(tenantId: string, id: string): Promise<any | null>;
  findManyInvitations(tenantId: string): Promise<any[]>;
  createInvitation(tenantId: string, data: any): Promise<any>;
  updateInvitation(tenantId: string, id: string, data: any): Promise<void>;

  findTenant(tenantId: string): Promise<any | null>;
  findTelegramProviderByUsername(username: string): Promise<any | null>;
}
