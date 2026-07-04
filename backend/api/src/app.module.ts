import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';

// Shared (infrastructure glue — NO domain knowledge, see Invariant 3)
import { HealthModule } from './shared/health/health.module';
import { PrismaModule } from './shared/prisma/prisma.module';

// Auth module — must be imported before any BFF that uses JwtAuthGuard/RolesGuard
import { AuthModule } from './modules/auth/auth.module';

// Guards registered globally so all routes are protected by default.
// JwtAuthGuard: fail-closed — routes opt out via @Public().
// RolesGuard: checks @Roles() metadata after JWT is verified.
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard';
import { RolesGuard } from './shared/guards/roles.guard';

// Domains (hexagonal — see Invariant 1). Each domain exposes ONE NestJS module.
// Domain controllers are mounted under /api/v1/internal/<domain>/* and gated
// by ServiceTokenGuard + InternalOnlyGuard. Browser frontends do NOT call them.


// BFF modules (one per browser frontend) — see ADR-008. Each is mounted
// under /api/v1/<bff>/* and is the ONLY HTTP surface its frontend may call.
// BFF use cases inject domain use cases via DI (no HTTP between modules).
import { StorefrontModule } from './modules/storefront/storefront.module';
import { AdminModule } from './modules/admin/admin.module';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module';
import { TenantModule } from './domains/tenant/tenant.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env', '../../.env.local', '../../.env'],
    }),

    // Rate limiting — throttler config. The /login endpoint overrides with 5/15min.
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute default window
        limit: 60,  // 60 req/min default per IP
      },
    ]),

    // In-process event bus — connects Order domain → Kitchen domain.
    // @OnEvent() handlers in KitchenModule subscribe to 'order.submitted'.
    EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 }),

    PrismaModule,
    HealthModule,

    // Auth module — provides JwtAuthGuard, RolesGuard, and all auth endpoints.
    // Must come before any module that uses the exported guards.
    AuthModule,

    // Domain modules — internal HTTP surface (`/api/v1/internal/<domain>/*`)

    TenantModule,

    // BFF modules — public HTTP surface (`/api/v1/<bff>/*`)
    StorefrontModule,
    AdminModule,
    PlatformAdminModule,

  ],
  providers: [
    // Register JwtAuthGuard globally — all routes require a valid JWT unless
    // decorated with @Public(). This is the "fail-closed" default.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // RolesGuard runs after JwtAuthGuard. Routes with @Roles() are enforced.
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule { }
