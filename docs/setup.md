# First-run setup

The setup API creates the first administrator without email delivery. It is a
narrow anonymous exception for an empty family catalog, not general signup.
The creating person becomes an ordinary active `admin`; later sign-ins use the
existing six-digit code flow. No invitation or outbound email is created for
this first account.

## Availability and creation

`GET /api/setup` returns only `{ isRequired: boolean }`, with
`Cache-Control: no-store`. Setup is required exactly when `members` contains
zero rows. Settings and unknown-address sign-in codes do not close it. Any
invited, active or removed member closes it permanently: removal preserves
identity history and never reopens anonymous creation.

`POST /api/setup` accepts the shared `createSetupRequestSchema`:

```json
{
  "admin": { "displayName": "Rosa", "email": "rosa@example.com" },
  "shoebox": { "name": "My Shoebox", "timezone": "America/New_York" },
  "public": { "baseUrl": "https://photos.example.com" },
  "mail": { "fromAddress": "family@example.com", "fromName": null }
}
```

`mail` is optional. Email normalization, display-name caps, valid IANA zones,
URLs and strict unknown-field rejection come from the existing shared
contract and setting registry. The admin cannot supply a role or internal
settings. Pile arrangement starts at `messy`. Sender name defaults to the
Shoebox name when a sender address is supplied with a null name; otherwise
omitted sender settings are unset. The public URL is editable independently
of the address used to access the server.

Creation takes a `BEGIN IMMEDIATE` writer lock, rechecks the absence of every
member row, then writes the active admin, settings, durable progress and a
standard 30-day hashed-token session. Settings changes have existing
`setting_changed` audit events attributed to the new admin and device. All
writes and the composed session-bootstrap response belong to that transaction.
An error rolls everything back. A competing request receives
`409 setup_already_completed`, with no identity details, cookie or writes.

The committed response is `201` with the ordinary `CreateSessionResponse`,
including `isFirstSignIn: true`, account details, session metadata and shell
settings. Only `Set-Cookie` receives the plaintext token, after commit, with
`HttpOnly`, `Secure`, `SameSite=Lax` and the standard lifetime. The response
body never carries a credential. Providers, email and B2 are not called.

## Serving-origin checks and rate limits

Creation requires `application/json`. A supplied `Origin` must be a serialized
HTTP or HTTPS origin matching the actual serving origin. `null`, malformed
origins and cross-origin requests receive `400 invalid_request`. Comparison
uses Fastify's request protocol and host, including the port, with its existing
single trusted proxy in production. Development ignores forwarded headers.
Vite's `/api` proxy preserves the browser-facing Host, so the serving origin remains the dev page's origin even
though Vite forwards requests to the separate API port.
The submitted `public.baseUrl` is never an authority for this check. Missing
Origin is accepted for non-browser clients.

The middleware's `setupCreatePerIp` rule allows 20 creation attempts per 3,600
seconds, using the existing process-memory IP buckets and `429 rate_limited`
response with `details.retryAfterSeconds`. Request logs contain no bodies,
addresses or session secrets, and IPs are neither persisted nor logged.

## Durable invitation progress

Creation writes the internal instance setting `setup.pending_member_id` to
the new admin's id. This is progress, not a special owner privilege, and it is
not exposed by public or editable settings routes.

| Route                      | Access       | Result                                                        |
| -------------------------- | ------------ | ------------------------------------------------------------- |
| `GET /api/setup/progress`  | Active admin | `{ needsInvitations: boolean }` and `Cache-Control: no-store` |
| `POST /api/setup/complete` | Active admin | Idempotent `204`, clearing pending progress                   |

Only the admin named by the setting receives `needsInvitations: true`. Any
active admin can complete onboarding, even if the original creator has changed
role. Completion rechecks authority under the writer lock and clears progress
with its audit event atomically. Completing already-clear or absent progress
changes nothing. A database with existing members and no progress setting is
already configured. Missing sessions receive `401 not_signed_in`; other roles
receive `403 setup_forbidden`.

After a lost response, an already-received cookie can recover through
`GET /api/me`. Otherwise ordinary code sign-in recovers the account. Retrying
creation never overwrites settings or creates a second administrator. The
setup screens and invitation navigation are the subsequent client task; this
module supplies their durable API.

## Verification

Route tests use fully migrated, unseeded in-memory catalogs. SQLite aborting
triggers prove creation and completion rollback. A separate-process fixture
opens two file-backed connections and verifies exactly one creation winner;
readiness rejects if a child errors or exits early. Children close applications
and connections before the parent removes only its own temporary directory.
No test opens a real deployment catalog or calls an external provider.
