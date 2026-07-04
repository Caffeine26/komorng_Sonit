import { z } from 'zod';
import { RoleEnum } from '@xfos/contracts-enums';

// 1. Zod Validation Schema for creating invitations
export const InviteMemberSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  telegramUsername: z.string()
    .min(1, "Telegram username is required")
    .transform(val => val.replace('@', '').trim()),
  email: z.string().email("Invalid email").optional().or(z.literal('')),
  role: RoleEnum,
});

export type InviteMemberRequest = z.infer<typeof InviteMemberSchema>;

// 2. Schema for rendering active members on the UI
export const TeamMemberResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  telegramUsername: z.string().optional(),
  email: z.string().optional(),
  role: RoleEnum,
  status: z.enum(['ACTIVE', 'INACTIVE']),
  joinedDate: z.string(),
});

export type TeamMemberResponse = z.infer<typeof TeamMemberResponseSchema>;

// 3. Schema for rendering pending invites on the UI
export const PendingInviteResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  telegramUsername: z.string(),
  email: z.string().optional(),
  role: RoleEnum,
  status: z.enum(['PENDING', 'EXPIRED']),
  expiresAt: z.string(),
  inviteUrl: z.string(),
});

export type PendingInviteResponse = z.infer<typeof PendingInviteResponseSchema>;

// 4. Combined payload for the dashboard index endpoint
export const TeamManagementOverviewSchema = z.object({
  members: z.array(TeamMemberResponseSchema),
  pendingInvites: z.array(PendingInviteResponseSchema),
});

export type TeamManagementOverview = z.infer<typeof TeamManagementOverviewSchema>;
