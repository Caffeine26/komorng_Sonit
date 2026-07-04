// Public contract surface for the merchant admin BFF — the ONLY contract
// package the admin frontend is allowed to import. Merchant-portal-shaped
// data: dense, includes editorial fields (cost, margin, audit trail) the
// customer never sees.
export * from './src/menu/overview/overview.contract';
export * from './src/dashboard/today-summary/today-summary.contract';
export * from './src/settings/update-settings/update-settings.contract';
export * from './src/team/team.contract';
export * from './src/table/table.contract';
export * from './src/catalog';
export * from './src/order';
export * from './src/cart';
export * from './src/customer/send-direct-message.contract';

export * from './src/customer/customer.contract';
export * from './src/marketing';

export * from './src/auth/auth.schema';
export * from './src/onboarding/onboarding.schema';
