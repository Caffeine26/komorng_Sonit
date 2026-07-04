import { createParamDecorator, ExecutionContext, NotFoundException } from '@nestjs/common';

export const CurrentTenant = createParamDecorator(
    (data: string | undefined, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();

        // 1. Try to get from authenticated user
        let tenantId = request.user?.tenantId;

        // 2. Try to get from Header
        if (!tenantId) {
            tenantId = request.headers['x-tenant-id'];
        }

        // 3. Try to get from request object (set by TenantAuthGuard)
        if (!tenantId) {
            tenantId = request.tenantId;
        }

        if (!tenantId) {
            throw new NotFoundException('Tenant not identified. Please provide X-Tenant-Id header.');
        }

        return data ? tenantId : tenantId;
    },
);
