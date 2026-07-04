// Re-export the generated Prisma client so backend packages can do:
//   import { PrismaClient, Prisma } from '@xfos/database';
// This keeps the generator output path as an implementation detail.
export * from './src/generated/client/index.js';
export type { Tenant, User, TenantSettings, TenantOperatingHours, TenantPaymentMethod } from './src/generated/client/index.js';
