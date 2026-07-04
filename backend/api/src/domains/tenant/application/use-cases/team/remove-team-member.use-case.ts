import { NotFoundError, ValidationError, ForbiddenError } from '../../../../../shared/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { ITeamRepository, TEAM_REPOSITORY_PORT } from '../../../core/ports/team.repository.port';
import { Inject } from '@nestjs/common';

@Injectable()
export class RemoveTeamMemberUseCase {
  constructor(
    @Inject(TEAM_REPOSITORY_PORT)
    private readonly teamRepository: ITeamRepository
  ) {}

  async execute(tenantId: string, memberId: string, removedById: string) {
    // 1. Prevent removing oneself
    if (memberId === removedById) {
      throw new ValidationError('You cannot remove yourself from the team.');
    }

    // 2. Fetch the target member's role in this tenant
    const targetRole = await this.teamRepository.findRole(tenantId, memberId);

    if (!targetRole) {
      throw new NotFoundError('Team member not found in this restaurant.');
    }

    // 3. Fetch the caller's role in this tenant to enforce hierarchy
    const callerRole = await this.teamRepository.findRole(tenantId, removedById);

    if (!callerRole) {
      throw new ForbiddenError('You do not have access to manage this team.');
    }

    // Enforce hierarchy: Only OWNER can remove an OWNER or MANAGER
    if (targetRole.role === 'TENANT_OWNER') {
      throw new ForbiddenError('You cannot remove the Restaurant Owner.');
    }

    if (targetRole.role === 'TENANT_MANAGER' && callerRole.role !== 'TENANT_OWNER') {
      throw new ForbiddenError('Only the Restaurant Owner can remove a Manager.');
    }

    // 4. Delete the UserRole record
    await this.teamRepository.deleteRole(tenantId, memberId);

    return { success: true };
  }
}
