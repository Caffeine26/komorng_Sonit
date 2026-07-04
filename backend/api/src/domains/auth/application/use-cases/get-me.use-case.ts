import { NotFoundError } from '../../../../shared/errors/domain-error';
import { Inject, Injectable } from '@nestjs/common';
import { UserRepositoryPort, USER_REPOSITORY_PORT } from '../../core/ports/user.repository.port';
import { ITenantRepository, TENANT_REPOSITORY_PORT } from '../../../tenant/core/ports/tenant.repository.port';

@Injectable()
export class GetMeUseCase {
    constructor(
        @Inject(USER_REPOSITORY_PORT)
        private readonly userRepo: UserRepositoryPort,
        @Inject(TENANT_REPOSITORY_PORT)
        private readonly tenantRepo: ITenantRepository,
    ) { }

    async execute(userId: string) {
        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new NotFoundError('User not found');
        }

        let tenantId: string | null = null;
        let tenantStatus: string | null = null;
        let tenantSlug: string | null = null;

        try {
            if (user.roles && user.roles.length > 0) {
                tenantId = user.resolvePrimaryTenantId();
                if (tenantId) {
                    const tenant = await this.tenantRepo.findById(tenantId);
                    tenantStatus = tenant?.status || null;
                    tenantSlug = tenant?.slug || null;
                }
            }
        } catch (err) {
            // Silently ignore tenant resolution errors for /me
        }

        return {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            roles: user.roleNames,
            tenantId,
            tenantStatus,
            tenantSlug,
        };
    }
}
