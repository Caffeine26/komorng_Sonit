import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ResolveQrSessionUseCase } from '../../modules/storefront/application/use-cases/resolve-qr-session.use-case';

/**
 * QrSessionGuard — validates the ?qr=TOKEN query param on storefront cart routes.
 *
 * Flow:query
 *   2. Delegates to Resol
 *   1. Reads ?qr= from the request veQrSessionUseCase (validates token, finds/creates session)
 *   3. Attaches to request:
 *        request.tenantId  → from QR context
 *        request.sessionId → ACTIVE OrderSession id
 *        request.qrContext → { id, tableId, tableRef }
 *   4. Returns true → controller proceeds
 *      Throws 401 → invalid/expired/inactive token
 *
 * Must be used together with @Public() on the controller class because
 * JwtAuthGuard is registered globally (APP_GUARD) in app.module.ts.
 */
@Injectable()
export class QrSessionGuard implements CanActivate {
  constructor(
    private readonly resolveQrSession: ResolveQrSessionUseCase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & {
      tenantId?: string;
      sessionId?: string;
      qrContext?: { id: string; tableId: string | null; tableRef: string | null };
    }>();

    const token = request.query?.['qr'] as string | undefined;

    if (!token) {
      throw new UnauthorizedException('QR token is required');
    }

    try {
      const session = await this.resolveQrSession.execute({ token });

      // Attach resolved context to request — controllers read from here
      request.tenantId = session.tenantId;
      request.sessionId = session.sessionId;
      request.qrContext = {
        id: session.qrContextId,
        tableId: session.tableId,
        tableRef: session.tableRef,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired QR code');
    }
  }
}
