import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { IOrderSessionRepository, ORDER_SESSION_REPOSITORY_PORT } from '../../../../domains/order/core/ports/order-session.repository.port';

export interface ResolveQrSessionInput {
  token: string;
}

export interface ResolveQrSessionOutput {
  tenantId: string;
  sessionId: string;
  qrContextId: string;
  tableId: string | null;
  tableRef: string | null;
}

@Injectable()
export class ResolveQrSessionUseCase {
  constructor(
    @Inject(ORDER_SESSION_REPOSITORY_PORT)
    private readonly orderSessionRepository: IOrderSessionRepository,
  ) {}

  async execute(input: ResolveQrSessionInput): Promise<ResolveQrSessionOutput> {
    // ── STEP 1: Validate QR context ────────────────────────────────────────
    const qrContext = await this.orderSessionRepository.findQrContextByTokenGlobal(input.token);

    if (!qrContext) {
      throw new UnauthorizedException('Invalid QR code');
    }

    if (!qrContext.isActive) {
      throw new UnauthorizedException('QR code is no longer active');
    }

    if (qrContext.expiresAt && qrContext.expiresAt < new Date()) {
      throw new UnauthorizedException('QR code has expired');
    }

    if (
      qrContext.contextType !== 'STOREFRONT' &&
      qrContext.contextType !== 'TABLE'
    ) {
      throw new UnauthorizedException('Invalid QR code type');
    }

    const now = new Date();

    // ── STEP 2: Update scan analytics on QrContext ────────────────────────
    await this.orderSessionRepository.incrementQrScan(qrContext.tenantId, qrContext.id);

    // ── STEP 3: Find existing ACTIVE session by Table (or QR context) ──────
    let existingSession = null;
    
    if (qrContext.tableId) {
      console.log(`[ResolveQrSession] Looking up active session for table ${qrContext.tableId}`);
      existingSession = await this.orderSessionRepository.findActiveSessionByTable(
        qrContext.tenantId,
        qrContext.tableId
      );
    } else {
      console.log(`[ResolveQrSession] Looking up active session for QR ${qrContext.id} (no table)`);
      existingSession = await this.orderSessionRepository.findActiveSessionByQrContext(
        qrContext.tenantId,
        qrContext.id
      );
    }

    if (existingSession) {
      console.log(`[ResolveQrSession] Found existing active session: ${existingSession.id}`);
    } else {
      console.log(`[ResolveQrSession] No active session found. Preparing to create new session.`);
    }

    // ── STEP 4: Create session if none exists, otherwise refresh activity ──
    let session: { id: string; tableRef: string | null };

    if (!existingSession) {
      const tableRef = qrContext.table?.label ?? null;
      console.log(`[ResolveQrSession] Creating new session for tableRef: ${tableRef}`);
      
      const newSession = await this.orderSessionRepository.createSession(qrContext.tenantId, {
        id: randomUUID(),
        qrContextId: qrContext.id,
        tableId: qrContext.tableId ?? undefined,
        tableRef,
        status: 'ACTIVE',
        openedAt: now,
        lastActivityAt: now,
        subtotalCents: 0,
        totalCents: 0,
        orderCount: 0,
        version: 1,
      } as any);
      session = newSession;
    } else {
      // Refresh lastActivityAt on every scan for existing sessions
      await this.orderSessionRepository.refreshSessionActivity(qrContext.tenantId, existingSession.id);
      session = existingSession;
    }

    // ── STEP 5: Return resolved context ───────────────────────────────────
    return {
      tenantId: qrContext.tenantId,
      sessionId: session.id,
      qrContextId: qrContext.id,
      tableId: qrContext.tableId ?? null,
      tableRef: session.tableRef ?? qrContext.table?.label ?? null,
    };
  }
}
