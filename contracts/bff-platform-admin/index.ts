// Public contract surface for the platform-admin BFF — the ONLY contract
// package the platform-admin frontend is allowed to import. Cross-tenant
// internal-ops shapes (suspending tenants, viewing audit logs, system health).
//
// Even though the platform-admin frontend is internal-only and IP-allowlisted,
// it still goes through its own BFF for the same UI-shaping reasons as the
// other three frontends. The BFF is thinner here (less projection), but it
// exists.
export * from './platform-admin.contract';
