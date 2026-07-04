// Re-export the generated Prisma client so backend packages can do:
//   import { PrismaClient, Prisma } from '@xfos/database';
// This keeps the generator output path as an implementation detail.
export * from '@prisma/client';
export type { Tenant, User, TenantSettings, TenantOperatingHours, TenantPaymentMethod } from '@prisma/client';
