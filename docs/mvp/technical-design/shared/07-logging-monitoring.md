# Logging & Monitoring — Shared Reference

> This file consolidates `10-logging.md` and `11-monitoring.md` into a single reference for all apps and the backend. The source files remain in the root for legacy links.

---

## Logging Strategy

- **Library:** [Pino](https://getpino.io) — fast, structured JSON logging, built for Node.js
- **Format:** JSON in production, pretty-print in development
- **Transport:** stdout in all environments → aggregated by deployment platform
- **No `console.log`** in application code — use the logger instance

---

## Log Levels

| Level | When to Use |
|---|---|
| `fatal` | System is unusable — crash, DB connection lost |
| `error` | Unexpected error that should never happen in normal operation |
| `warn` | Expected error handled correctly (invalid auth, not found, business rule violation) |
| `info` | Key lifecycle events — request received, order created, payment confirmed |
| `debug` | Detailed flow for debugging — query params, intermediate state |
| `trace` | Very detailed — only in local dev |

**Production default level: `info`**
**Development default level: `debug`**

---

## Logger Setup

```typescript
// src/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' },
    },
  }),
  base: {
    service: 'api',
    env: process.env.NODE_ENV,
  },
  redact: {
    paths: ['req.headers.authorization', 'body.password', 'body.passwordHash'],
    censor: '[REDACTED]',
  },
});

export type Logger = typeof logger;
```

---

## Request Logging (NestJS)

```typescript
// backend/api/src/shared/nestjs/interceptors/request-logging.interceptor.ts
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: { tenantId?: string; sub?: string } }>();
    const res = http.getResponse<Response>();
    const requestId = req.header('x-request-id') ?? randomUUID();
    const start = Date.now();
    const reqLog = logger.child({ requestId });

    reqLog.info({
      event: 'request.start',
      method: req.method,
      path: req.path,
      tenantId: req.user?.tenantId,
      userId: req.user?.sub,
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - start;
          const level =
            res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
          reqLog[level]({
            event: 'request.complete',
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs,
            tenantId: req.user?.tenantId,
          });
        },
      }),
    );
  }
}
```

---

## What to Log

### Always Log (info level)

```typescript
// Auth events
logger.info({ event: 'auth.login', userId, tenantId });
logger.info({ event: 'auth.logout', userId });
logger.warn({ event: 'auth.failed', email, reason: 'invalid_credentials' });

// Order lifecycle
logger.info({ event: 'order.created', orderId, tenantId, total });
logger.info({ event: 'order.confirmed', orderId, tenantId });
logger.info({ event: 'order.cancelled', orderId, tenantId, reason });

// Payment events
logger.info({ event: 'payment.initiated', paymentId, method, billId, tenantId });
logger.info({ event: 'payment.succeeded', paymentId, method, amount, billId });
logger.warn({ event: 'payment.failed', paymentId, method, reason });
logger.warn({ event: 'payment.expired', paymentId, method });

// Kitchen events
logger.info({ event: 'ticket.created', ticketId, orderId, tenantId });
logger.info({ event: 'ticket.status_changed', ticketId, from, to, userId });

// Tenant lifecycle
logger.info({ event: 'tenant.activated', tenantId });
logger.warn({ event: 'tenant.suspended', tenantId, reason });
```

### Log at Warn Level (handled errors)

```typescript
logger.warn({ event: 'auth.token_expired', userId, path: req.path });
logger.warn({ event: 'auth.unauthorized', role, required, path: req.path });
logger.warn({ event: 'order.invalid_item', tenantId, itemIds });
logger.warn({ event: 'bill.already_paid', billId, tenantId });
logger.warn({ event: 'qr.invalid', token, path: req.path });
```

### Log at Error Level (unexpected failures)

```typescript
logger.error({ event: 'db.query_failed', error: err.message, stack: err.stack });
logger.error({ event: 'aba.callback_failed', error: err.message, payload });
logger.error({ event: 'job.processing_failed', jobName, error: err.message });
```

---

## Domain Service Logging Pattern

Pass a logger child with domain context:

```typescript
export class OrderService {
  private log: Logger;

  constructor(private readonly deps: OrderServiceDeps) {
    this.log = logger.child({ domain: 'ordering' });
  }

  async createOrder(params: CreateOrderParams) {
    this.log.info({ event: 'order.creating', tenantId: params.tenantId });
    try {
      const order = await this.orderRepo.create(params);
      this.log.info({ event: 'order.created', orderId: order.id, total: order.total });
      return order;
    } catch (err) {
      this.log.error({ event: 'order.create_failed', tenantId: params.tenantId, error: err.message });
      throw err;
    }
  }
}
```

---

## Sensitive Data — Never Log

```typescript
// ❌ NEVER log these
logger.info({ password: '...' });
logger.info({ passwordHash: '...' });
logger.info({ authorization: req.headers.authorization });
logger.info({ cardNumber: '...' });
logger.info({ refreshToken: '...' });
// Pino redact config handles most of this automatically (see logger setup above)
```

---

## Structured Log Example (Production)

```json
{
  "level": 30,
  "time": 1705312200000,
  "service": "api",
  "env": "production",
  "requestId": "req_abc123",
  "tenantId": "uuid-tenant",
  "userId": "uuid-user",
  "domain": "billing",
  "event": "payment.succeeded",
  "paymentId": "uuid-payment",
  "method": "ABA_QR",
  "amount": "12.50",
  "billId": "uuid-bill"
}
```

---

## Log Aggregation

| Platform | Log Service |
|---|---|
| Vercel (Next.js) | Vercel Log Drains → Logtail |
| Railway (NestJS API) | Built-in log viewer + drain to Logtail |
| Local dev | `pino-pretty` to terminal |

**Recommended for MVP:** [Logtail / Better Stack](https://betterstack.com) — free tier generous enough for early stage.

---

## Log Retention

| Environment | Retention |
|---|---|
| Production | 30 days (searchable), 90 days (archived) |
| Staging | 7 days |
| Development | Local only |

---

## Monitoring Goals for MVP

Focus on three things:
1. **Know when the system is down** before users do
2. **Know when something is broken** (payment failures, order errors)
3. **Know when it's slow** (response time degradation)

Do not over-engineer observability at MVP. Start minimal, add as real issues surface.

---

## Health Check Endpoints

Every service must expose a health endpoint:

```typescript
// GET /health — public, no auth
@Get()
async health() {
  const checks = await this.healthService.check();
  const healthy = checks.database === 'ok' && checks.redis === 'ok';
  if (!healthy) throw new ServiceUnavailableException({ status: 'degraded', checks });
  return { status: 'ok', timestamp: new Date().toISOString(), checks };
}

// GET /health/ready — used by load balancer to route traffic
@Get('ready')
ready() {
  return { status: 'ready' };
}
```

---

## Key Metrics to Track

### Business Metrics (most important)

| Metric | Alert If |
|---|---|
| Orders per hour | Drops to 0 during restaurant hours |
| Payment success rate | Falls below 90% |
| Payment failure count | > 5 failures in 10 min |
| Kitchen ticket creation rate | Drops to 0 during service hours |
| Error rate (5xx) | > 1% of requests |

### Technical Metrics

| Metric | Alert If |
|---|---|
| API response time (p95) | > 2000ms |
| API response time (p99) | > 5000ms |
| DB query time (p95) | > 500ms |
| DB connection pool saturation | > 80% |
| Redis memory | > 80% used |
| BullMQ job failures | Any failure in payment/notification jobs |

---

## Uptime Monitoring

**Tool: [Betterstack Uptime](https://betterstack.com)** (free tier: 10 monitors)

| Check | URL | Frequency | Alert |
|---|---|---|---|
| API health | `GET /health` | Every 1 min | If 3 consecutive failures |
| Storefront | `GET /s` (302 OK) | Every 1 min | If 3 consecutive failures |
| Admin portal | `GET /login` | Every 5 min | If 3 consecutive failures |
| Kitchen app | `GET /login` | Every 5 min | If 3 consecutive failures |

---

## Error Tracking (Sentry)

```typescript
// backend/api/src/main.ts
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,  // 10% of requests
});

// In global exception filter — capture unexpected errors only
if (!(exception instanceof AppError)) {
  Sentry.captureException(exception, {
    extra: { requestId, path: req.path, method: req.method, tenantId: req.auth?.tenantId },
  });
}
```

---

## Alerting Rules

| Alert | Condition | Urgency |
|---|---|---|
| API is down | Health check fails 3× | Critical — immediate |
| Payment failures | > 5 failed payments in 10 min | High — within 5 min |
| 5xx spike | > 5 errors in 1 min | High — within 5 min |
| DB connection lost | Health check DB = error | Critical — immediate |
| Slow API | p95 > 3s for 5 min | Medium — within 15 min |
| BullMQ job failing | Any payment job failure | High — within 5 min |

---

## Database Monitoring

```typescript
// Log slow queries via Prisma events
prisma.$on('query', (e) => {
  if (e.duration > 500) {
    logger.warn({
      event: 'db.slow_query',
      query: e.query,
      durationMs: e.duration,
    });
  }
});
```

---

## Kitchen App Real-Time Monitoring

The kitchen app depends on WebSocket connections. Monitor active connections per tenant:

```typescript
io.on('connection', (socket) => {
  const tenantId = socket.data.tenantId;
  metrics.increment('ws.connections.active', { tenantId });
  logger.info({ event: 'ws.connected', socketId: socket.id, tenantId });

  socket.on('disconnect', () => {
    metrics.decrement('ws.connections.active', { tenantId });
    logger.info({ event: 'ws.disconnected', socketId: socket.id, tenantId });
  });
});
```

---

## MVP Monitoring Stack Summary

| Need | Tool | Cost |
|---|---|---|
| Uptime monitoring | Betterstack Uptime | Free (10 monitors) |
| Error tracking | Sentry | Free (5k errors/month) |
| Log aggregation | Logtail / Betterstack | Free (1GB/month) |
| APM / performance | Sentry Performance | Free |
| Alerts | Betterstack / Sentry | Free |

**Total cost at MVP: $0.** Upgrade when you have paying tenants and real traffic.
