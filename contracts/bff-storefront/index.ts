// Public contract surface for the storefront BFF — the ONLY contract package
// the storefront frontend is allowed to import.
//
// These shapes are projected for the customer-facing UI: only the fields a
// customer needs to see, never internal merchant fields. The underlying
// `contracts/{order,catalog,billing,tenant}/` packages stay backend-internal.
export * from './storefront.contract';
export * from './auth-telegram.contract';
export * from './src/order';
export * from './src/cart';
export * from './src/notification';
export * from './src/profile';
