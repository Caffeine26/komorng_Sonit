import { Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { IOrderSessionRepository, ORDER_SESSION_REPOSITORY_PORT } from '../../../../domains/order/core/ports/order-session.repository.port';
import { Inject } from '@nestjs/common';

@Injectable()
export class CreateAdminSessionUseCase {
  constructor(
    @Inject(ORDER_SESSION_REPOSITORY_PORT)
    private readonly orderSessionRepository: IOrderSessionRepository
  ) {}

  async execute(
    input: { tenantId: string }
  ): Promise<{ sessionId: string }> {

    const session = await this.orderSessionRepository.createSession(input.tenantId, {
      id: randomUUID(),
      status: 'ACTIVE',
      openedAt: new Date(),
      lastActivityAt: new Date(),
      subtotalCents: 0,
      totalCents: 0,
      orderCount: 0,
      version: 1,
    } as any);

    return { sessionId: session.id }
  }
}
