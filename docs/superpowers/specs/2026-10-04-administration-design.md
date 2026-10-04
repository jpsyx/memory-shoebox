# Step 8a: administration and first-run setup

**Status:** draft for Juan Pablo's review. Product implementation has not started.
**Branch:** `feat/administration`.
**Milestone:** [step 8a](../../prds/2026-09-27-memory-shoebox/plan/step-8a.md).

## Intent and scope

Finish the administration backend: members, invitations, groups, instance
settings, presence, item viewers, activity and mail health. Add the first-run
experience requested on 2026-10-04. Someone opening a fresh Shoebox should
create their own account as its initial admin, name it, optionally invite
others, then reach the existing home page and upload.

Step 7b's outstanding acceptance moves to the final acceptance stage after
all build steps. Its existing implementation remains the upload surface
consumed here. This does not waive automated verification for step 8a.

The binding administration and observation contracts are
[administration.md](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/administration.md)
and [notifications.md](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/notifications.md),
including their rulings. This design adds setup rather than redesigning those
contracts. Existing admin screens remain step 9; milestone and removal
screens remain step 8b. The setup screen is the explicit frontend addition.

## First-run approach

| Approach                                                 | Consequence                                                                              | Decision                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Create the first admin and session atomically from setup | Works before email is configured; closes anonymous creation as soon as one member exists | Selected: matches the requested first-access assumption |
| Require an emailed code before creating the first member | Needs a new provisional identity/code flow and functioning mail before setup             | Additional dependency for an otherwise empty Shoebox    |
| Seed an admin through a deployment command               | Keeps the existing development workaround                                                | Does not deliver the requested first-load experience    |

The person completing setup is trusted as the initial administrator. Merely
loading the URL performs no write and reserves nothing. If two people open
setup, the first successful creation transaction becomes the admin; the
other receives a conflict and follows ordinary sign-in. There is no claim
token in a URL, password, new owner role or second account system. The owner
has the existing `admin` role, with the same last-admin protections as every
other administrator.

Email verification is not required for this one-time account creation. Later
sign-ins, including this admin's, use the existing emailed six-digit code.
The setup form shows the normalized email before submission and explains
that it is their permanent sign-in address. Creating the admin must work
without Resend availability or configured sender settings.

### Availability and durable progress

Setup is required only when `members` contains **zero rows**, regardless of
item count, settings rows, sessions or transient sign-in-code rows. A catalog
with invited, active or removed members is initialized. In particular,
removing all members must never reopen public account creation.

Register one internal instance setting, `setup.pending_member_id`, with a
nullable member-id schema, default `null`, and no anonymous readability or
administrative settings-write capability. Creation sets it to the new
admin's id; completion clears it. It is progress, not an ownership privilege.
No new table or member column is needed. Existing databases with members and
no such setting are already configured and bypass onboarding.

The creating admin resumes the invitation screen after a refresh or sign-in
while this setting names them. Other members use ordinary app routing. Any
active admin may explicitly complete setup, so a role change does not leave
an unrecoverable wizard. Completing setup is idempotent. The initial admin
and settings persist even when an invitation fails or the browser closes.

### Screens and navigation

Use the established Mantine theme, square sheets, typography, Day/Night
renditions and existing input/button styles. The flow is an Operate surface:
one task per screen, labelled fields and visible next/skip actions.

1. **Set up your Shoebox** at `/setup`: Shoebox name (default `My Shoebox`),
   the admin's display name and email, and the instance timezone prefilled
   from the browser with a UTC fallback. A settings section contains the
   public URL prefilled from `window.location.origin` and optional mail
   sender address/name. The public URL remains editable for deployments
   accessed through a temporary address. Keep pile arrangement at `messy`.
   Sender name defaults to the entered Shoebox name when a sender address
   is supplied. Do not assume the admin's inbox is a verified sender domain.
2. **Invite your people** at `/setup/invite`: one or more addresses, each
   with an optional display name and role defaulting to viewer. Start with
   one row and offer **Add another person**. Use `POST /api/members` for each
   address, without introducing a bulk-invitation API. Successful submission
   queues invitations and completes setup before navigating home. Partial
   failure keeps successful rows marked as queued and failed rows editable;
   retry submits only failures. Keep an explicit **Skip for now** action,
   which preserves any invitations already queued. Invitations never gate upload.
3. **Home** at `/`: the existing archive empty state and the admin's existing
   upload entry point. The signed-in shell owns the upload controller as it
   already does. Subsequent visits use normal routing.

Further invitations after setup use the administration capability delivered
here and the member surface built in step 9. Do not build the full Members
screen early.

When mail is unconfigured or failing, read actual mail health after the admin
session exists. Say an invitation is queued rather than claiming delivery,
show the applicable configuration diagnosis, and retain skip. The creating
session remains usable to upload and configure the Shoebox. Secrets, B2
credentials, API keys, DNS changes and infrastructure setup remain in server
configuration and deployment documentation.

The root route checks setup before rendering sign-in or the app on a cold
load, including an addressed URL. An initialization read failure shows a
retry state rather than assuming the catalog is empty. Once initialized,
the existing sign-in redirect and deep-link behavior remain intact.
Entering `/setup` on an initialized catalog redirects to the invitation
screen for the pending admin, home for a signed-in member, or sign-in for
an anonymous visitor. A stale tab that loses the creation race must not
write settings or receive an admin session.

Before creation, Back preserves the local form without database writes.
After creation, reload reads durable progress. Successful creation followed
by a lost response uses `/api/me` to recover the session if the cookie was
received; otherwise ordinary code sign-in recovers the account. A retry
never creates another initial admin. No setup state is stored in URLs or
browser storage with an email or credential.

### Setup API additions

| Method and path            | Access                           | Result                                                                                                            |
| -------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET /api/setup`           | Anonymous                        | `{ isRequired: boolean }`, with no member identity, count, settings or content                                    |
| `POST /api/setup`          | Anonymous while no member exists | Creates first admin/settings/session; `201` with the existing session-bootstrap response shape and session cookie |
| `GET /api/setup/progress`  | Active admin session             | `{ needsInvitations: boolean }`, indicating pending onboarding for this admin                                     |
| `POST /api/setup/complete` | Active admin session             | Clears pending progress; idempotent `204`                                                                         |

The creation body contains `admin: { displayName, email }` and
`shoebox: { name, timezone }`, `public: { baseUrl }`, plus optional
`mail: { fromAddress, fromName }`. Reuse shared email normalization, string
caps and `SETTING_DEFINITIONS` validation. Reject unknown fields, invalid
zones and URLs. A caller cannot request a role or write internal settings.

Use `runInImmediateTransaction` to recheck that no members exist, then write
the active admin with first-join/sign-in timestamps, validated instance
settings, pending progress, the standard hashed-token session and audit
events together. Failures roll everything back. Set the cookie only after
commit. Reuse `createSessionForMember`, `getMeDtoFromMemberId`, shell settings
and cookie helpers; no credential enters the JSON response. No invitation
row is needed for the initial admin.

Return `409 setup_already_completed` on any initialized catalog; it carries
no existing account details and writes nothing. Protected setup routes use
the existing `401` and an admin-only `403 setup_forbidden`. Malformed input
uses `400 invalid_request`; middleware limits setup creation to 20 attempts
per hour per IP in memory, with the existing `429` envelope. Do not log IPs
or bodies. Require JSON and reject a supplied cross-origin `Origin` on the
creation route, comparing it against the request's serving origin, never
against the submitted public URL. Setup status/progress reads are uncached
so a stale response cannot reopen creation or strand a refresh.

## Administration implementation

### Members, invitations and sessions

Implement the existing member routes and their admin/directory response
split, including admin-only status filtering. Query member rows, latest
invitations and sessions in batches. Preserve the canonical `SessionDto`.

Inviting creates an invited member or reuses a removed row, keeping historic
authorship and join timestamps. Insert the invitation, write the activity
event and enqueue its email in the same transaction. The offered role stays
on the member, not on the invitation. Acceptance stays in existing auth.

Role changes and member removal hold an immediate transaction and recount
active admins after mutation; zero rolls back. Invited admins never count.
Removal destroys sessions and memberships and revokes pending invitations,
preserving content and person links. Revocation closes invited membership,
rather than changing only the invitation row.

Resend updates the same invitation's count, send instant and seven-day expiry,
with a new `invite:<id>:<send_count>` idempotency key. Enforce the minute/day
caps in middleware. Give `invitation-lapse` its full transactional cleanup,
including memberships and visibility invalidation; do not introduce a second
expiry rule in sign-in. Fix its existing misleading comment that says resend
creates a new row as part of this touched module.

An admin may revoke any matching member/session pair. Return byte-identical
not-found responses for nonexistent and mismatched sessions. Member
suggestions stay admin-only because their item counts are unfiltered.

### Groups and visibility

Serve full group rows to admins and only picker references to uploaders.
Viewers receive `403`. Use grouped usage queries and batched memberships.
Normalize group names identically to tags, accept invited members, and
reject removed/unknown members. Respect each documented generation-bump
trigger; renaming alone does not change access.

Usage reports show narrowing and widening separately, including items left
visible only to admins and their uploaders. Compute access deltas from rule
subjects and memberships in sets, with no per-member or per-rule query loop.

The ten-minute HMAC confirmation binds the group id and canonical usage
snapshot. Include subjects, expanded membership and item assignments as
well as modes/counts, so changing the affected audience or replacing an item
without changing a total invalidates the confirmation. Derive a separate
HMAC key from the server secret. Recompute and validate under the same
immediate transaction that removes subjects, recomputes digests, deletes
the group, bumps generation and writes the audit event. Preserve empty
`only` rules and tolerate equivalent duplicates.

### Settings and timezone

Serve and patch the six existing editable keys through the shared registry.
Internal setup progress, domain-check keys and visibility generation cannot
be written through this route. Reads compute storage totals, defaults and
provenance; no timezone scan on an ordinary read.

Preview and save share timezone-impact computation. Saving moves only
offset-less items, writes a capture-date-change row per moved item, ejects
items from bursts when their day changes, and reopens milestone mismatch
flags. Preserve capture instants, original dates and capture sources. Verify
each move is revertible through the existing item date flow. All setting
changes and their activity events commit together. Setup writes the zone
before uploads; existing seeded instances retain the documented preview
before first browser-zone seeding.

On a `public.base_url` write, requeue only failed `base_url_unset` messages
younger than seven days. Recompose absolute link fields from their triggers,
preserving frozen copy, recipients, counts and idempotency keys. Expired
sign-in codes must not become usable or be presented as fresh when repaired.

### Presence, activity and mail health

Presence reads the existing durable marks over ninety Shoebox-local days.
Batch member/count queries; add neither impressions nor `last_seen_at` on
items. Non-admins may read only their own complete record. Item viewers
apply item visibility before role checks and include eligible members with
no views, plus removed members who actually opened the item.

Activity reads only `activity_events`, preserving historical labels and
device labels. Use deterministic `(occurred_at, id)` cursor pagination,
explicit per-kind detail parsing and an exhaustive family map. Unknown kinds
throw even when a family filter was supplied rather than silently vanishing.
Widen the existing activity writer only for this slice's subjects and kinds.

Mail health reuses the existing queue aggregates and serves the documented
diagnosis ladder, with base URL first. Provider-derived verification facts
must have a real source; no admin-supplied `verified` flag or invented success.
Capture any necessary provider-read adapter behind a fakeable seam without
changing mail delivery semantics. This step does not add the prototype's
uncontracted send-test or domain-recheck UI/actions, which require step 9's
own contract decision. Mail failure must not invalidate existing sessions.

## Invitation email

Add the last compiled react-email template and renderer registry entry.
Reuse the existing HTML/plain-text shell. Freeze inviter attribution,
Shoebox identity, sender, timezone, address, expiry and the invitee's own
prospective visible item count at enqueue. Expand their role and groups at
that time; never print the unrestricted archive total for a restricted
invitee. Suppression and duplicate handling stay in the existing queue.

Keep the prototype's useful copy: nothing to install, no password, an
address-prefilled join page, and a six-digit code requested there. The link
carries no credential. Match zero/singular/plural counts and seven-day expiry
in HTML and text. Reuse `/join` and its existing address-to-sign-in mapping.

## Files and boundaries

Implementation belongs in `apps/server/src/` and its tests,
`packages/shared/src/` and its tests, and `packages/emails/src/` and its tests.
The first-run UI, route guard and API adapter belong in `apps/web/src/`, with
fresh-catalog scenarios in `e2e/`. Generate the route tree through Vite.
Do not import from or modify prototypes, generated skills, storage layout,
unrelated archive logic or existing admin placeholder screens.

Update `docs/auth.md`, `docs/configuration.md`, `docs/web.md`, `docs/server.md`,
`docs/mail.md`, `docs/emails.md`, `docs/e2e.md` and `docs/architecture.md` as
their implementation changes. Document administration in `docs/administration.md`
and setup in `docs/setup.md`, linking both from `docs/README.md`. Extend API
and data-model documentation for setup's narrow anonymous exception and
internal progress key. These documentation updates accompany product code;
the draft must not describe unimplemented behavior as shipped.

## Verification and review focus

Use red/green TDD for product behavior; documentation-only changes need
formatting, link and diff checks. Every implementation task observes its
failing tests before writing the implementation. Final checks are `pnpm check`
plus targeted Playwright runs against real local API/catalog/storage seams.
No real invitation email is sent during automated verification.

- Setup: truly unseeded migrated catalog; no-member settings-present case;
  invited/removed-member catalogs stay closed; concurrency through separate
  database connections; replay; transaction rollback; stale tabs; JSON and
  Origin checks; no mail dependency; correct role, cookie and timestamps.
- UI: creation, invitation and skip all use real routes; reload during
  invitations; partial invitation failure/retry without duplicate sends;
  lost creation response; normal
  initialized/deep-link routing; home upload availability; keyboard focus,
  labelled errors, 200% layout and Day/Night at phone and desktop widths.
- Members: last-admin demotion/removal rollback, including concurrent
  admins and invited-admin exclusions; immediate session revocation;
  re-invitation keeps identity; resend expiry/idempotency/throttles; revoked
  and job-lapsed invitees cannot redeem existing codes.
- Groups: retroactive grant/revoke without a new sign-in; `except` widening;
  empty `only` rules; confirmation expiry, tampering and changed subjects,
  membership or item assignments; no directory counts leak to lower roles.
- Settings: zero-row defaults; validation and internal-key refusal; preview
  has no writes; per-item timezone history/revert, burst and milestone effects;
  selective seven-day mail repair preserves frozen payloads.
- Observation: self record exception; invisible item returns the same `404`
  as nonexistent before checking role; removed-member view history; local-day
  boundaries; stable pagination; unknown activity kind fails loudly; safe
  detail parsing and frozen labels; mail diagnosis precedence and privacy.
- Email: restricted invitee's prospective count, admin count, expiry,
  escaped content, HTML/plain-text agreement and compiled runtime import.

The detailed implementation plan follows review of this written design.
Implement that plan with subagent-driven development as step 8a requests,
then obtain independent code review. Leave branch integration and publication
to Juan Pablo's explicit Git instructions.
