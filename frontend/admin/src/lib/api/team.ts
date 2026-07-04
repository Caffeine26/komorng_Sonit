import {
  type InviteMemberRequest,
  type PendingInviteResponse,
  type TeamManagementOverview,
} from '@xfos/contracts-bff-admin'
import { apiFetch } from './client'

const withTenant = (slug?: string): Record<string, string> => {
  if (!slug) return {}
  return { 'x-tenant-slug': String(slug) }
}

export async function getAdminTeamOverview(
  tenantSlug?: string,
  token?: string
): Promise<TeamManagementOverview> {
  return apiFetch<TeamManagementOverview>(
    '/api/v1/admin/team',
    { headers: withTenant(tenantSlug),
      token }
  )
}

export async function inviteAdminTeamMember(
  data: InviteMemberRequest,
  tenantSlug?: string,
  token?: string
): Promise<PendingInviteResponse> {
  return apiFetch<PendingInviteResponse>(
    '/api/v1/admin/team/invitations',
    { method: 'POST', body: data,
      headers: withTenant(tenantSlug),
      token }
  )
}

export async function revokeAdminInvitation(
  id: string,
  tenantSlug?: string,
  token?: string
): Promise<void> {
  return apiFetch<void>(
    `/api/v1/admin/team/invitations/${id}`,
    { method: 'DELETE',
      headers: withTenant(tenantSlug),
      token }
  )
}

export async function removeAdminTeamMember(
  id: string,
  tenantSlug?: string,
  token?: string
): Promise<void> {
  return apiFetch<void>(
    `/api/v1/admin/team/members/${id}`,
    { method: 'DELETE',
      headers: withTenant(tenantSlug),
      token }
  )
}

export async function updateAdminTeamMember(
  id: string,
  data: {
    name: string
    email?: string
    role: string
  },
  tenantSlug?: string,
  token?: string
): Promise<void> {
  return apiFetch<void>(
    `/api/v1/admin/team/members/${id}`,
    { method: 'PATCH', body: data,
      headers: withTenant(tenantSlug),
      token }
  )
}
