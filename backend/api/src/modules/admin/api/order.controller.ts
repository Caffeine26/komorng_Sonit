import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { TenantAuthGuard } from '../../../shared/guards/tenant-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/guards/roles.decorator';
import { ZodValidationPipe } from '../../../shared/nestjs/pipes/zod-validation.pipe';

import {
  submitOrderAdminInputSchema,
  type SubmitOrderAdminInput,
  updateOrderStatusInputSchema,
  type UpdateOrderStatusInput as UpdateOrderStatusDto,
} from '@xfos/contracts-bff-admin';
import { OrderStatus } from '@xfos/contracts-enums';

import { SubmitOrderAdminUseCase } from '../../../domains/order/application/use-cases/submit-order-admin.use-case';
import { GetOrdersUseCase } from '../../../domains/order/application/use-cases/get-orders.use-case';
import { UpdateOrderStatusUseCase } from '../../../domains/order/application/use-cases/update-order-status.use-case';
import { AcknowledgeNewItemsUseCase } from '../../../domains/order/application/use-cases/acknowledge-new-items.use-case';

interface AuthenticatedRequest extends Request {
  user: { sub: string; roles: string[] };
  tenantId: string; // Injected by TenantAuthGuard
}

/**
 * Admin order controller — used by POS and KDS to manage orders.
 */
@UseGuards(JwtAuthGuard, TenantAuthGuard, RolesGuard)
@Roles('TENANT_OWNER', 'TENANT_MANAGER', 'SERVICE_STAFF')
@Controller('admin/orders')
export class AdminOrderController {
  constructor(
    private readonly submitOrderAdminUseCase: SubmitOrderAdminUseCase,
    private readonly getOrdersUseCase: GetOrdersUseCase,
    private readonly updateOrderStatusUseCase: UpdateOrderStatusUseCase,
    private readonly acknowledgeNewItemsUseCase: AcknowledgeNewItemsUseCase,
  ) {}

  @Get()
  async getOrders(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: OrderStatus,
    @Query('sessionId') sessionId?: string,
    @Query('tableId') tableId?: string,
    @Query('customerId') customerId?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

    return this.getOrdersUseCase.execute({
      tenantId: req.tenantId,
      status,
      sessionId,
      tableId,
      customerId,
      limit,
      offset,
    });
  }

  @Post()
  async submitOrder(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(submitOrderAdminInputSchema)) body: SubmitOrderAdminInput,
  ) {
    return this.submitOrderAdminUseCase.execute({
      tenantId: req.tenantId,
      sessionId: body.sessionId ?? undefined,
      tableId: body.tableId,
      items: body.items,
      notes: body.notes,
      createdById: req.user.sub,
      locale: body.locale,
    });
  }

  @Post(':orderId/acknowledge-new-items')
  async acknowledgeNewItems(
    @Req() req: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return this.acknowledgeNewItemsUseCase.execute({
      tenantId: req.tenantId,
      orderId,
    });
  }

  @Patch(':orderId/status')
  async updateOrderStatus(
    @Req() req: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(updateOrderStatusInputSchema)) body: UpdateOrderStatusDto,
  ) {
    await this.updateOrderStatusUseCase.execute({
      tenantId: req.tenantId,
      orderId,
      status: body.status,
      cancellationReason: body.cancellationReason,
      reason: body.reason,
      actorId: req.user.sub,
    });
    
    return { success: true };
  }
}
