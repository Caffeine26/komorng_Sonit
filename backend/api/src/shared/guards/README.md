# shared/guards/

Three-wall protection for internal API endpoints. See ADR-008 in
`docs/playbook/technical-design/shared/09-decisions-adrs.md`.

## The walls

| Wall | Mechanism | What it catches |
|---|---|---|
| 1 | URL prefix `/api/v1/internal/*` | Developer mistakes — wrong `@Controller(...)` decorator |
| 2 | `ServiceTokenGuard` (this folder) | Misrouted requests — even if a route lands under the wrong prefix, user JWTs are rejected |
| 3 | `InternalOnlyGuard` (this folder) | Network exposure — even if guards are misconfigured, the request never reaches the server from the public internet |

All three must be misconfigured for an internal endpoint to leak.

## How to use

Apply both guards at the **class level** to every controller mounted under
`/api/v1/internal/*`:

```ts
@Controller('internal/order')
@UseGuards(InternalOnlyGuard, ServiceTokenGuard)
export class OrderController { ... }
```

Order matters slightly: `InternalOnlyGuard` returns 404 before
`ServiceTokenGuard` returns 401, so a public probe gets a generic 404 instead
of a "you're missing auth" hint.

## Configuration

Set in `.env`:

```bash
# Wall 2 — service token (32+ chars, generated with `openssl rand -hex 32`)
INTERNAL_API_SERVICE_TOKEN=<long-random-string>

# Wall 3 — allowed hostnames (comma-separated). localhost and *.railway.internal
# are always allowed. Add your office IP / VPN hostname / private DNS here.
INTERNAL_API_ALLOWED_HOSTS=ops.xfos.internal,vpn.xfos.com
```

## Why service tokens, not user JWTs

Internal consumers are scripts, cron jobs, admin tools, and partner
integrations — none of which have a "user" identity. They have a
**service identity**. Forcing internal consumers through user JWTs would
require fake user accounts, which leak into audit logs and confuse the
permission model. A separate service token surface keeps the two identity
domains distinct.
