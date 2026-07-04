import { 
  Controller, 
  Get, 
  Post, 
  Patch,
  Delete, 
  Body, 
  Param, 
  Req, 
  UseGuards, 
  HttpCode, 
  HttpStatus,
  BadRequestException
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { TenantAuthGuard } from '../../../shared/guards/tenant-auth.guard';
import { Roles } from '../../../shared/guards/roles.decorator';
import { ZodValidationPipe } from '../../../shared/nestjs/pipes/zod-validation.pipe';

import { 
  InviteMemberSchema, 
  type InviteMemberRequest,
  type TeamManagementOverview
} from '@xfos/contracts-bff-admin';

import { ListTeamMembersUseCase } from '../../../domains/tenant/application/use-cases/team/list-team-members.use-case';
import { InviteTeamMemberUseCase } from '../../../domains/tenant/application/use-cases/team/invite-team-member.use-case';
import { RemoveTeamMemberUseCase } from '../../../domains/tenant/application/use-cases/team/remove-team-member.use-case';
import { RevokeInvitationUseCase } from '../../../domains/tenant/application/use-cases/team/revoke-invitation.use-case';
import { UpdateTeamMemberUseCase } from '../../../domains/tenant/application/use-cases/team/update-team-member.use-case';

interface AuthenticatedRequest extends Request {
  user: { sub: string; roles: string[] };
  tenantId: string; // resolved by TenantAuthGuard
}

@Controller('admin/team')
@UseGuards(JwtAuthGuard, TenantAuthGuard, RolesGuard)
@Roles('TENANT_OWNER', 'TENANT_MANAGER')
export class TeamController {
  constructor(
    private readonly listTeamMembersUseCase: ListTeamMembersUseCase,
    private readonly inviteTeamMemberUseCase: InviteTeamMemberUseCase,
    private readonly removeTeamMemberUseCase: RemoveTeamMemberUseCase,
    private readonly revokeInvitationUseCase: RevokeInvitationUseCase,
    private readonly updateTeamMemberUseCase: UpdateTeamMemberUseCase,
  ) {}

  @Get()
  async getTeam(@Req() req: AuthenticatedRequest): Promise<TeamManagementOverview> {
    return this.listTeamMembersUseCase.execute(req.tenantId);
  }

  @Post('invitations')
  async inviteMember(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(InviteMemberSchema)) body: InviteMemberRequest,
  ) {
    const callerId = req.user.sub;
    return this.inviteTeamMemberUseCase.execute(req.tenantId, callerId, body);
  }

  @Delete('invitations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('id') inviteId: string,
  ) {
    await this.revokeInvitationUseCase.execute(req.tenantId, inviteId);
  }

  @Patch('members/:id')
  async updateMember(
    @Req() req: AuthenticatedRequest,
    @Param('id') memberId: string,
    @Body() body: { name: string; email?: string; role: string },
  ) {
    const callerId = req.user.sub;
    
    if (memberId === callerId) {
      throw new BadRequestException('You cannot edit your own role or profile from the team directory.');
    }

    await this.updateTeamMemberUseCase.execute(req.tenantId, memberId, callerId, body);

    return { success: true };
  }

  @Delete('members/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Req() req: AuthenticatedRequest,
    @Param('id') memberId: string,
  ) {
    const callerId = req.user.sub;
    await this.removeTeamMemberUseCase.execute(req.tenantId, memberId, callerId);
  }
}
