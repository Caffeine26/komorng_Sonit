import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import {
  StorefrontSubmitOrderRequestSchema,
  type StorefrontSubmitOrderRequest,
  type StorefrontSubmitOrderResponse,
  type StorefrontContextResponse,
  type StorefrontOrderStatusResponse,
} from '@xfos/contracts-bff-storefront';
import { ZodValidationPipe } from '../../../shared/nestjs/pipes/zod-validation.pipe';
import { GetStorefrontContextUseCase } from '../application/use-cases/get-storefront-context.use-case';
import { ResolveQrSessionUseCase } from '../application/use-cases/resolve-qr-session.use-case';
import { Public } from '../../../shared/guards/public.decorator';

/**
 * Storefront BFF controller — the ONLY HTTP surface for the customer-facing
 * storefront frontend. See ADR-008.
 *
 * Mounted under `/api/v1/storefront/*` (no auth guards beyond what tenant
 * resolution requires — this is the public customer-facing surface).
 *
 * This controller is THIN. It validates the request, calls a BFF use case,
 * and returns the typed response. The use case orchestrates calls to the
 * underlying domain use cases.
 */
@Public()
@Controller('storefront')
export class StorefrontController {
  constructor(
    private readonly getContextUseCase: GetStorefrontContextUseCase,
    private readonly resolveQrSessionUseCase: ResolveQrSessionUseCase,
  ) {}

  /**
   * One call returns tenant + menu — the storefront landing page renders
   * with a single fetch. The BFF use case combines tenant + catalog domains.
   */
  @Get('context/:slug')
  async getContext(@Param('slug') slug: string): Promise<StorefrontContextResponse> {
    const result = await this.getContextUseCase.execute({ slug });
    if (!result) throw new NotFoundException({ error: 'TENANT_NOT_FOUND' });
    return result;
  }

  /**
   * GET /storefront/qr/resolve?token=TOKEN_XYZ
   * Called by the frontend when the customer first scans a QR code.
   * Returns tenantId + sessionId which the frontend stores in memory
   * and passes as ?qr=TOKEN on all subsequent cart API calls.
   */
  @Get('qr/resolve')
  async resolveQr(
    @Query('token') token: string,
  ): Promise<{ tenantId: string; sessionId: string; tableRef: string | null; tableId: string | null; qrContextId: string }> {
    if (!token) throw new BadRequestException('token is required');
    const result = await this.resolveQrSessionUseCase.execute({ token });
    return {
      tenantId: result.tenantId,
      sessionId: result.sessionId,
      tableRef: result.tableRef,
      tableId: result.tableId,
      qrContextId: result.qrContextId,
    };
  }
}

