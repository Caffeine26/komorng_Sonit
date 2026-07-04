import { Controller, Get, Post, Param, Body, UseGuards, Req } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { TenantAuthGuard } from '../../../shared/guards/tenant-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/guards/roles.decorator';
import { ZodValidationPipe } from '../../../shared/nestjs/pipes/zod-validation.pipe';
import { sendDirectMessageInputSchema, type SendDirectMessageInput } from '@xfos/contracts-bff-admin';
import { GetTenantCustomersUseCase } from '../../../domains/tenant/application/use-cases/get-tenant-customers.use-case';
import { SendDirectMessageUseCase } from '../../../domains/notification/application/use-cases/send-direct-message.use-case';

interface AuthenticatedRequest extends Request {
  user: { sub: string; roles: string[] };
  tenantId: string; // Injected by TenantAuthGuard
}

@Controller('admin/customers')
@UseGuards(JwtAuthGuard, TenantAuthGuard, RolesGuard)
@Roles('TENANT_OWNER', 'TENANT_MANAGER', 'SERVICE_STAFF')
export class CustomerController {
  constructor(
    private readonly getTenantCustomersUseCase: GetTenantCustomersUseCase,
    private readonly sendDirectMessageUseCase: SendDirectMessageUseCase,
  ) {}

  @Get()
  async getCustomers(@Req() req: AuthenticatedRequest) {
    const customers = await this.getTenantCustomersUseCase.execute({
      tenantId: req.tenantId,
    });

    return customers.map(customer => ({
      id: customer.id,
      userId: customer.userId,
      fullName: customer.fullName || null,
      avatarUrl: customer.avatarUrl || null,
      isVip: customer.isVip,
      totalSpentCents: customer.totalSpentCents,
      totalOrders: customer.totalOrders,
      loyaltyPoints: customer.loyaltyPoints,
      customerSegment: customer.customerSegment || null,
      lastVisitAt: customer.lastVisitAt ? customer.lastVisitAt.toISOString() : null,
      internalNotes: customer.internalNotes || null,
      telegramUsername: customer.telegramUsername || null,
      phone: customer.phone || null,
      createdAt: customer.createdAt.toISOString(),
    }));
  }

  @Post(':id/message')
  async sendDirectMessage(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendDirectMessageInputSchema)) body: SendDirectMessageInput
  ) {
    await this.sendDirectMessageUseCase.execute({
      tenantId: req.tenantId,
      tenantCustomerId: id,
      message: body.message,
    });

    return { success: true };
  }
}

