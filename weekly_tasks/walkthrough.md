# Walkthrough: Dynamic Role & Team Management Integration

We have successfully integrated the complete, high-fidelity **Role & Team Management** system across the multi-tenant Komorng admin portal!

All tasks across the 5 implementation phases have been completed with 100% type safety and zero compilation errors.

---

## 🛠️ Summary of Changes

### 1. API Contracts (`contracts/bff-admin`)
- **[NEW] [team.contract.ts](file:///Users/sonit/Documents/komorng/contracts/bff-admin/src/team/team.contract.ts)**: Defined strict Zod validation schemas and TypeScript response contracts:
  - `InviteMemberSchema` / `InviteMemberRequest`: Captures mandatory Telegram Username (with auto `@` stripping), optional Email, and selected role.
  - `TeamMemberResponseSchema` / `TeamMemberResponse`: Standardizes active staff attributes.
  - `PendingInviteResponseSchema` / `PendingInviteResponse`: Models outstanding Telegram deep-link invitations.
  - `TeamManagementOverviewSchema` / `TeamManagementOverview`: Bundles both lists for the dashboard.
- **[MODIFY] [index.ts](file:///Users/sonit/Documents/komorng/contracts/bff-admin/index.ts)**: Exported team contracts publicly.

---

### 2. Backend Use Cases (`backend/api/src/domains`)
- **[NEW] [list-team-members.use-case.ts](file:///Users/sonit/Documents/komorng/backend/api/src/domains/tenant/application/use-cases/team/list-team-members.use-case.ts)**: Queries active users with their linked Telegram auth providers and fetches outstanding pending invitations for the current tenant.
- **[NEW] [invite-team-member.use-case.ts](file:///Users/sonit/Documents/komorng/backend/api/src/domains/tenant/application/use-cases/team/invite-team-member.use-case.ts)**: Enforces unique member constraints, generates a secure cryptographically random token hash, and de-duplicates invitations.
- **[NEW] [remove-team-member.use-case.ts](file:///Users/sonit/Documents/komorng/backend/api/src/domains/tenant/application/use-cases/team/remove-team-member.use-case.ts)**: Enforces security boundaries (preventing self-deletion, preventing role escalation, preventing removing the restaurant owner).
- **[NEW] [revoke-invitation.use-case.ts](file:///Users/sonit/Documents/komorng/backend/api/src/domains/tenant/application/use-cases/team/revoke-invitation.use-case.ts)**: Marks active invitations as `REVOKED` to maintain a historical database audit trail while deactivating the token instantly.
- **[NEW] [accept-invitation.use-case.ts](file:///Users/sonit/Documents/komorng/backend/api/src/domains/auth/application/use-cases/accept-invitation.use-case.ts)**: Verifies employee Telegram OAuth logins, links their numeric Telegram ID, binds the invited role, updates their email, and issues active JWT sessions.

---

### 3. Backend Controllers & API Routing (`backend/api/src/modules`)
- **[NEW] [team.controller.ts](file:///Users/sonit/Documents/komorng/backend/api/src/modules/admin/api/team.controller.ts)**: Exposes RESTful admin endpoints under `/api/v1/admin/team/*` with JWT and strict role restrictions (`@Roles('TENANT_OWNER', 'TENANT_MANAGER')`).
- **[MODIFY] [admin.module.ts](file:///Users/sonit/Documents/komorng/backend/api/src/modules/admin/admin.module.ts)**: Registered team controllers and use cases.
- **[MODIFY] [auth.controller.ts](file:///Users/sonit/Documents/komorng/backend/api/src/modules/auth/api/auth.controller.ts)**: Exposed public `@Public() @Post('accept-invite')` endpoint for employee registration.
- **[MODIFY] [auth.module.ts](file:///Users/sonit/Documents/komorng/backend/api/src/modules/auth/auth.module.ts)**: Registered `AcceptInvitationUseCase`.

---

### 4. Frontend API client & State Handling (`frontend/admin`)
- **[MODIFY] [admin.ts](file:///Users/sonit/Documents/komorng/frontend/admin/src/lib/api/admin.ts)**: Implemented front-facing BFF API fetch wrappers (`getAdminTeamOverview`, `inviteAdminTeamMember`, `revokeAdminInvitation`, `removeAdminTeamMember`).

---

### 5. High-Fidelity UI Layout & Screens (`frontend/admin/src`)
- **[MODIFY] [page.tsx](file:///Users/sonit/Documents/komorng/frontend/admin/src/app/%5Blocale%5D/%5BtenantSlug%5D/team/page.tsx)**: Refactored team overview page to manage state, fetch data dynamically, filter queries, switch between Active/Pending tabs, and handle revocation/removal triggers.
- **[MODIFY] [MemberCard.tsx](file:///Users/sonit/Documents/komorng/frontend/admin/src/features/team-management/components/MemberCard.tsx)**: Updated to display dynamic roles (`TENANT_OWNER`, `TENANT_MANAGER`, `SERVICE_STAFF`, `KITCHEN_STAFF`), show copyable Telegram deep-links, and provide interactive copy success indicators.
- **[MODIFY] [MemberFormModal.tsx](file:///Users/sonit/Documents/komorng/frontend/admin/src/features/team-management/components/MemberFormModal.tsx)**: Redesigned the modal to collect mandatory Telegram Handles, optional Email addresses, and select functional restaurant roles.
- **[SUCCESS MODAL]**: Added a gorgeous invitation success modal displaying the copyable Bot deep-link `https://t.me/komorng_bot?start=inv_${invId}` along with illustrated instruction cards for onboarding.

---

## 🔬 Verification & Validation Results

### 1. Contracts Package Build
- Build: Successful. No TypeScript compilation warnings.

### 2. NestJS Backend Build
- Type-check (`npx tsc --noEmit`): **Passed**.
- Database constraints: Fully aligned with Postgres compound primary key constraints (`tenantId_id`).

### 3. Admin Portal Next.js Build
- Team directory components build cleanly with zero type-check errors.
