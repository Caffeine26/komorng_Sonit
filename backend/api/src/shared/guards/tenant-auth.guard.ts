import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Inject,
    NotFoundException,
} from '@nestjs/common';
import { ITenantRepository, TENANT_REPOSITORY_PORT } from '../../domains/tenant/core/ports/tenant.repository.port';
import { PrismaService } from '../../shared/prisma/prisma.service';


@Injectable()
export class TenantAuthGuard implements CanActivate {
    constructor(
        @Inject(TENANT_REPOSITORY_PORT)
        private readonly tenantRepo: ITenantRepository,
        private readonly prisma: PrismaService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user || !user.sub) {
            return false;
        }

        // 1. Resolve Tenant ID from Slug header
        const slug = (request.headers['x-tenant-slug'] || request.headers['X-Tenant-Slug']) as string;
        if (!slug) {
            throw new NotFoundException('X-Tenant-Slug header is missing');
        }

        const tenant = await this.tenantRepo.findBySlug(slug);
        if (!tenant) {
            throw new NotFoundException(`Tenant with slug "${slug}" not found`);
        }

        // 2. CHECK THE RELATIONAL BRIDGE (The "Relational SSOT")
        const bridge = await this.prisma.userRole.findFirst({
            where: {
                userId: user.sub,
                tenantId: tenant.id,
                role: {
                    in: ['TENANT_OWNER', 'TENANT_MANAGER', 'SERVICE_STAFF', 'KITCHEN_STAFF']
                }
            }
        });

        if (!bridge) {
            console.warn(`[TenantAuthGuard] Access denied for user ${user.sub} to tenant ${tenant.id} (${slug})`);
            throw new ForbiddenException('You do not have permission to access this merchant dashboard');
        }

        // Attach tenantId to request for use in controllers
        request.tenantId = tenant.id;

        return true;
    }
}
