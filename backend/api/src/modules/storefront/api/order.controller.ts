import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  Res,
  UseGuards,
  Query,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../../shared/guards/public.decorator';
import { QrSessionGuard } from '../../../shared/guards/qr-session.guard';
import { ZodValidationPipe } from '../../../shared/nestjs/pipes/zod-validation.pipe';
import {
  submitOrderStorefrontInputSchema,
  type SubmitOrderStorefrontInput,
} from '@xfos/contracts-bff-storefront';
import { SubmitOrderStorefrontUseCase } from '../../../domains/order/application/use-cases/submit-order-storefront.use-case';
import { GetOrderStatusUseCase } from '../../../domains/order/application/use-cases/get-order-status.use-case';
import { GetCustomerOrderHistoryUseCase } from '../../../domains/order/application/use-cases/get-customer-order-history.use-case';
import { GetOrderPdfUseCase } from '../../../domains/order/application/use-cases/get-order-pdf.use-case';
import { PrismaService } from '../../../shared/prisma/prisma.service';

type QrRequest = Request & {
  tenantId: string;
  sessionId: string;
  qrContext?: { id: string; tableId: string | null; tableRef: string | null };
  user?: { sub?: string; id?: string };
};

/**
 * Storefront order controller — anonymous customer-facing order endpoints.
 *
 * Auth: @Public() skips the global JwtAuthGuard.
 *       @UseGuards(QrSessionGuard) validates the ?qr=TOKEN query param,
 *       resolves tenantId + sessionId, and attaches them to request.
 */
@Public()
@Controller('storefront/orders')
export class StorefrontOrderController {
  constructor(
    private readonly submitOrderUseCase: SubmitOrderStorefrontUseCase,
    private readonly getOrderStatusUseCase: GetOrderStatusUseCase,
    private readonly getCustomerOrderHistoryUseCase: GetCustomerOrderHistoryUseCase,
    private readonly getOrderPdfUseCase: GetOrderPdfUseCase,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /storefront/orders/customer-identity
   * Returns the customer name/phone/avatar resolved from the QR session
   * via the phone/telegram identity chain — no JWT required.
   */
  @Get('customer-identity')
  @UseGuards(QrSessionGuard)
  async getCustomerIdentity(@Req() req: QrRequest) {
    const sessionId = req.sessionId;
    if (!sessionId) return { customer: null };

    // Walk: sessionId → most recent order with a linked userId
    const linked = await this.prisma.order.findFirst({
      where: { sessionId, userId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { userId: true },
    });

    if (!linked?.userId) return { customer: null };

    const user = await this.prisma.user.findUnique({
      where: { id: linked.userId },
      select: { fullName: true, phone: true, avatarUrl: true },
    });

    if (!user) return { customer: null };

    let phone = user.phone ?? null;
    if (phone?.startsWith('+855')) phone = '0' + phone.slice(4);
    else if (phone?.startsWith('855')) phone = '0' + phone.slice(3);

    return {
      customer: {
        fullName: user.fullName ?? null,
        phone,
        avatarUrl: user.avatarUrl ?? null,
      },
    };
  }

  /**
   * GET /storefront/orders/history
   * Fetches the order history for the authenticated customer
   */
  @Get('history')
  @UseGuards(QrSessionGuard)
  async getOrderHistory(@Req() req: QrRequest) {
    const userId = req.user?.sub || req.user?.id;
    if (!userId && !req.sessionId) {
      return [];
    }
    
    return this.getCustomerOrderHistoryUseCase.execute({
      tenantId: req.tenantId,
      userId: userId,
      sessionId: req.sessionId,
    });
  }

  /**
   * POST /storefront/orders?qr=TOKEN
   * Submits the cart to become an order.
   */
  @Post()
  @UseGuards(QrSessionGuard)
  async submitOrder(
    @Req() request: QrRequest,
    @Body(new ZodValidationPipe(submitOrderStorefrontInputSchema)) body: SubmitOrderStorefrontInput,
  ) {
    return this.submitOrderUseCase.execute({
      tenantId: request.tenantId,
      sessionId: request.sessionId,
      cartId: body.cartId,
      tableRef: request.qrContext?.tableRef || body.tableRef,
      tableId: request.qrContext?.tableId || body.tableId,
      qrContextId: request.qrContext?.id || body.qrContextId,
      notes: body.notes,
      userId: request.user?.sub || request.user?.id,
      locale: body.locale,
    });
  }

  /**
   * GET /storefront/orders/:token
   * Fetches the order status anonymously.
   */
  @Get(':token')
  async getOrderStatus(@Param('token') token: string) {
    return this.getOrderStatusUseCase.execute(token);
  }

  /**
   * GET /storefront/orders/:token/pdf
   * Generates and returns a PDF of the order receipt.
   */
  @Get(':token/pdf')
  async getOrderPdf(
    @Param('token') token: string,
    @Query('lang') lang: string,
    @Res() res: any
  ) {
    const { buffer: pdfBuffer, orderNumber } = await this.getOrderPdfUseCase.execute(token, lang);
    
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="receipt_${orderNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    
    res.end(pdfBuffer);
  }
}


