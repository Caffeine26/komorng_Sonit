import { Injectable, Inject } from '@nestjs/common';
import { ITeamRepository, TEAM_REPOSITORY_PORT } from '../../../core/ports/team.repository.port';
import { ValidationError, ForbiddenError } from '../../../../../shared/errors/domain-error';

@Injectable()
export class UpdateTeamMemberUseCase {
  constructor(
    @Inject(TEAM_REPOSITORY_PORT)
    private readonly teamRepository: ITeamRepository
  ) {}

  async execute(
    tenantId: string,
    memberId: string,
    callerId: string,
    data: { name: string; email?: string; role: string },
  ): Promise<void> {
    if (memberId === callerId) {
      throw new ValidationError('You cannot edit your own role or profile from the team directory.');
    }

    const userRole = await this.teamRepository.findRole(tenantId, memberId);

    if (!userRole) {
      throw new ValidationError('Member not found in this restaurant.');
    }

    if (userRole.role === 'TENANT_OWNER') {
      throw new ForbiddenError('You cannot modify the primary Restaurant Owner.');
    }

    await this.teamRepository.updateUserAndRole(
      tenantId,
      memberId,
      { fullName: data.name, email: data.email || null },
      { role: data.role as any }
    );
  }
}
