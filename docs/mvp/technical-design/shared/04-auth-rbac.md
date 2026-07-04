# 09 — Authentication and Authorization

## Overview

- **Authentication:** JWT-based (access token + refresh token)
- **Authorization:** Role-based access control (RBAC) enforced per request
- **Tenant isolation:** `tenant_id` is always read from the verified JWT, never from the request body
- **No Supabase Auth** — custom JWT flow for full control

---

## Authentication Flow

### Token Strategy

| Token | Storage | Lifetime | Purpose |
|---|---|---|---|
| Access Token | Memory (JS variable) | 15 minutes | Authorize API requests |
| Refresh Token | `httpOnly` cookie | 7 days | Obtain new access token |

**Why httpOnly cookie for refresh token:**
- JavaScript cannot read `httpOnly` cookies → immune to XSS token theft
- Automatically sent by browser → no manual handling needed
- `SameSite=Strict` prevents CSRF

### Access Token Payload (JWT)

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "tenantId": "tenant-uuid",   // null for platform admins
  "role": "TENANT_OWNER",
  "iat": 1705312200,
  "exp": 1705313100
}
```

### Login Flow

```typescript
// POST /api/v1/auth/login
async function login(email: string, password: string) {
  const user = await userRepo.findByEmail(email);
  if (!user) throw new AppError('AUTH_INVALID_CREDENTIALS', 'Invalid credentials', 401);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError('AUTH_INVALID_CREDENTIALS', 'Invalid credentials', 401);

  const accessToken = signAccessToken({ userId: user.id, tenantId, role });
  const refreshToken = signRefreshToken({ userId: user.id });

  // Store refresh token hash in DB for rotation/invalidation
  await tokenRepo.saveRefreshToken(user.id, hashToken(refreshToken));

  return { accessToken, refreshToken };
}
```

### Setting the Refresh Token Cookie

```typescript
res.cookie('refreshToken', refreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/v1/auth/refresh',     // Scoped path
});
```

---

## Auth Guard (NestJS)

NestJS uses **Guards** for authentication/authorization. We authenticate requests with a `JwtAuthGuard` (Passport strategy) and enforce tenant context with a `TenantGuard` (rejects tokens with no `tenantId` on tenant-scoped routes).

```typescript
// backend/api/src/domains/auth/api/guards/jwt-auth.guard.ts
import { AuthGuard } from '@nestjs/passport';

export class JwtAuthGuard extends AuthGuard('jwt') {}

// backend/api/src/domains/tenant/api/guards/tenant.guard.ts
import { CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

export class TenantGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<{ user?: { tenantId?: string | null } }>();
    if (!req.user?.tenantId) throw new ForbiddenException('No tenant context');
    return true;
  }
}
```

---

## Role Definitions

| Role | Scope | Capabilities |
|---|---|---|
| `PLATFORM_ADMIN` | Global | Full platform access: all tenants, onboarding, billing, system config |
| `TENANT_OWNER` | Tenant-scoped | Full tenant control: settings, menu, QR, team, billing view |
| `TENANT_MANAGER` | Tenant-scoped | Menu + QR + settings (no team/billing) |
| `KITCHEN_STAFF` | Tenant-scoped | Kitchen app only: view tickets, update status |

---

## Authorization (NestJS Roles Guard)

Use a `@Roles(...)` decorator + `RolesGuard` to enforce RBAC on controllers/handlers.

```typescript
// backend/api/src/shared/nestjs/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const ROLES_KEY = 'roles';
export type Role = 'PLATFORM_ADMIN' | 'TENANT_OWNER' | 'TENANT_MANAGER' | 'KITCHEN_STAFF';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

// backend/api/src/domains/auth/api/guards/roles.guard.ts
import { CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Role } from '../decorators/roles.decorator';

export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;

    const req = ctx.switchToHttp().getRequest<{ user?: { role?: Role } }>();
    if (!req.user?.role || !required.includes(req.user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
```

### Usage in Controllers

```typescript
// Kitchen endpoints — only KITCHEN_STAFF and up
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('KITCHEN_STAFF', 'TENANT_MANAGER', 'TENANT_OWNER')
@Get('/kitchen/tickets')
getTickets() {}

// Admin settings — only TENANT_OWNER
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('TENANT_OWNER')
@Patch('/admin/tenant/settings')
updateSettings() {}

// Platform routes — only PLATFORM_ADMIN (no tenant context)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PLATFORM_ADMIN')
@Get('/platform/tenants')
listTenants() {}
```

---

## Role Permission Matrix

| Action | Platform Admin | Tenant Owner | Tenant Manager | Kitchen Staff |
|---|---|---|---|---|
| List all tenants | ✓ | | | |
| Activate/suspend tenant | ✓ | | | |
| Update tenant profile | ✓ | ✓ | | |
| Manage menu items | ✓ | ✓ | ✓ | |
| Configure payments | ✓ | ✓ | | |
| Manage QR codes | ✓ | ✓ | ✓ | |
| Invite team members | ✓ | ✓ | | |
| View kitchen queue | ✓ | ✓ | ✓ | ✓ |
| Update ticket status | ✓ | ✓ | ✓ | ✓ |
| Confirm cash payment | ✓ | ✓ | ✓ | ✓ |
| View billing | ✓ | ✓ | | |
| Access storefront | Public | | | |

---

## Invitation Flow

```typescript
// Sales team creates an invite
// POST /api/v1/platform-admin/onboarding/:merchantId/invite
async function createInvitation(email: string, tenantId: string, role: string) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = addHours(new Date(), 72); // 72-hour expiry

  await inviteRepo.create({
    email,
    tenantId,
    role,
    token: hashToken(token),  // store hash, send raw token
    expiresAt,
  });

  await emailService.sendInvite(email, { token, tenantId });
}

// Merchant accepts invite
// POST /api/v1/auth/accept-invite
async function acceptInvite(token: string, password: string) {
  const invite = await inviteRepo.findByToken(hashToken(token));

  // Three distinct error cases — each returns a different machine-readable code
  if (!invite) {
    throw new AppError('AUTH_INVITE_INVALID', 'Invitation not found', 400);
  }
  if (invite.status === 'ACCEPTED') {
    throw new AppError('AUTH_INVITE_USED', 'Invitation already accepted', 409);
  }
  if (invite.expiresAt < new Date() || invite.status === 'EXPIRED') {
    throw new AppError('AUTH_INVITE_EXPIRED', 'Invitation has expired', 410);
  }

  const user = await userRepo.createOrLink(invite.email, hashPassword(password));
  await userRoleRepo.assign(user.id, invite.tenantId, invite.role);
  await inviteRepo.markUsed(invite.id); // sets status → ACCEPTED

  // Issue tokens
  return issueTokens(user, invite.tenantId, invite.role);
}
```

---

## Tenant Isolation Enforcement

**Rule:** Every query against tenant-owned data must include `WHERE tenant_id = :tenantId` using the JWT-sourced `tenantId`, not a client-supplied value.

```typescript
// ✓ CORRECT — tenant_id from JWT
async function getMenuItems(req: Request) {
  const { tenantId } = req.auth; // from JWT
  return menuItemRepo.findAll({ tenantId });
}

// ✗ WRONG — tenant_id from request body
async function getMenuItems(req: Request) {
  const { tenantId } = req.body; // attacker can send any tenant_id
  return menuItemRepo.findAll({ tenantId });
}
```

In the repository layer:
```typescript
// Always enforce tenant scope in repository methods
async findAll({ tenantId }: { tenantId: string }) {
  return prisma.menuItem.findMany({
    where: {
      tenantId,           // MANDATORY — never omit
      deletedAt: null,
      isVisible: true,
    },
  });
}
```

### Defence-in-Depth: Prisma Middleware

The repository convention (always pass `tenantId`) is the primary enforcement layer.
Add a Prisma query middleware as a defence-in-depth check that raises a loud error if a
query on a tenant-scoped model is executed without a `tenantId` filter:

```typescript
// src/lib/prisma.ts
prisma.$use(async (params, next) => {
  const TENANT_SCOPED_MODELS = [
    'MenuCategory', 'MenuItem', 'Order', 'Bill', 'KitchenTicket',
    'QrContext', 'OrderSession', 'SetupProgress',
  ];

  if (
    TENANT_SCOPED_MODELS.includes(params.model ?? '') &&
    params.action === 'findMany' &&
    !params.args?.where?.tenantId
  ) {
    // In test: throw to catch missing tenant scoping early
    // In prod: log a critical alert (never silently allow — this is data leakage)
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        `[TenantIsolation] ${params.model}.${params.action} called without tenantId filter`
      );
    }
    logger.error({ model: params.model, action: params.action },
      'CRITICAL: tenant-scoped query missing tenantId — possible data leakage');
  }
  return next(params);
});
```

This does NOT replace repository-level enforcement — it is a safety net that catches
omissions during development and alerts on them in production.

---

## Role Removal — Forced Token Invalidation

When a team member is removed via `DELETE /admin/team/:userId`, or their role is downgraded
via `PATCH /admin/team/:userId/role`, the access token in their client remains valid until
its 15-minute expiry. To eliminate this window for high-sensitivity operations:

```typescript
// On role removal or team member delete:
async function revokeUserTenantTokens(userId: string, tenantId: string): Promise<void> {
  // Delete all refresh tokens for this user scoped to this tenant.
  // Next token refresh will fail → user is forced to log in again.
  // Access token still valid up to 15 minutes — acceptable tradeoff for JWT.
  await tokenRepo.deleteByUserAndTenant(userId, tenantId);
}

// Called from:
// - DELETE /admin/team/:userId  → revokeUserTenantTokens(userId, req.auth.tenantId)
// - PATCH /admin/team/:userId/role (on downgrade) → revokeUserTenantTokens(userId, ...)
```

**MVP approach:** Revoke refresh tokens immediately on next refresh AND maintain a
per-`jti` access token denylist in Redis. Every authenticated request checks Redis for
the `jti` — latency is ~0.5–1ms per request (local Redis hit). Denylist entries are
TTL'd to `exp` of the access token (max 15 minutes), so the set stays small.

This closes the 15-minute access window immediately on revocation — required for MVP
tenant-isolation guarantees since forced role downgrades must take effect without waiting
for token expiry.

**Schema note:** `refresh_tokens.tenant_id TEXT REFERENCES tenants(id)` is
already present (nullable, since platform admins have no tenant). See
[`enums-tables-design/tables/refresh-tokens.md`](../../enums-tables-design/tables/refresh-tokens.md).

---

## Security Checklist

- [ ] Passwords hashed with `bcrypt` (cost factor 12+)
- [ ] Access tokens expire in 15 minutes
- [ ] Refresh tokens stored as hash (not plaintext)
- [ ] `httpOnly` + `SameSite=Strict` cookie for refresh token
- [ ] `tenant_id` always sourced from JWT, never client input
- [ ] Role checked on every protected route
- [ ] Invitation tokens are single-use and expire
- [ ] All auth failures return generic message (no user enumeration)
- [ ] Rate limiting on login endpoint (5 attempts / 15 min)
- [ ] Token refresh rotation (old token invalidated on refresh)
- [ ] Refresh tokens revoked on role removal / team member delete
