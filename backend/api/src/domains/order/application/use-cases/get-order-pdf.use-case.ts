import { Injectable, Logger, Inject } from '@nestjs/common';
import { OrderNotFoundError } from '../../core/errors/order.errors';
import { TenantNotFoundError } from '../../../tenant/core/errors/tenant.errors';
import { IOrderRepository, ORDER_REPOSITORY_PORT } from '../../core/ports/order.repository.port';
import { ITenantRepository, TENANT_REPOSITORY_PORT } from '../../../tenant/core/ports/tenant.repository.port';
import { IPdfGeneratorService, PDF_GENERATOR_SERVICE } from '../../core/ports/pdf-generator.service.port';

@Injectable()
export class GetOrderPdfUseCase {
  private readonly logger = new Logger(GetOrderPdfUseCase.name);

  constructor(
    @Inject(ORDER_REPOSITORY_PORT)
    private readonly orderRepository: IOrderRepository,
    @Inject(TENANT_REPOSITORY_PORT)
    private readonly tenantRepository: ITenantRepository,
    @Inject(PDF_GENERATOR_SERVICE)
    private readonly pdfGeneratorService: IPdfGeneratorService,
  ) {}

  async execute(token: string, requestedLocale?: string): Promise<{ buffer: Buffer; orderNumber: string }> {
    const order = await this.orderRepository.findByToken(token);
    if (!order) {
      throw new OrderNotFoundError(token);
    }

    const tenant = await this.tenantRepository.findById(order.tenantId);
    if (!tenant) {
      throw new TenantNotFoundError(order.tenantId);
    }

    this.logger.log(`[GetOrderPdfUseCase] Delegating PDF generation for order ${token}`);
    
    return this.pdfGeneratorService.generateOrderReceipt(order, tenant, requestedLocale);
  }
}

