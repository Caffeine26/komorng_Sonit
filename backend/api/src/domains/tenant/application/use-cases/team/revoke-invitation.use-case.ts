import { NotFoundError } from '../../../../../shared/errors/domain-error';
import { Injectable, Inject } from '@nestjs/common';
import { ITeamRepository, TEAM_REPOSITORY_PORT } from '../../../core/ports/team.repository.port';

@Injectable()
export class RevokeInvitationUseCase {
  constructor(
    @Inject(TEAM_REPOSITORY_PORT)
    private readonly teamRepository: ITeamRepository
  ) {}

  async execute(tenantId: string, inviteId: string) {
    const invite = await this.teamRepository.findInvitationById(tenantId, inviteId);

    if (!invite) {
      throw new NotFoundError('Invitation not found.');
    }

    // Mark as revoked to de-activate the token
    await this.teamRepository.updateInvitation(tenantId, inviteId, { status: 'REVOKED' as any });

    return { success: true };
  }
}
