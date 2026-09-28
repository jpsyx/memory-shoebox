# Step 3a: identity and access

**Step design** for step 3a of
[`docs/prds/2026-09-27-memory-shoebox/plan/step-3a.md`](../../prds/2026-09-27-memory-shoebox/plan/step-3a.md).

This is not the product spec. The product spec is
[`docs/PRODUCT.md`](../../PRODUCT.md) and
[`design-spec.md`](../../prds/2026-09-27-memory-shoebox/design-spec.md). What
this step implements is settled in
[`auth.md`](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/auth.md),
[`conventions.md`](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md)
§ The auth middleware and § The visibility predicate,
[`administration.md`](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/administration.md)
`GET /api/public-settings`, and
[`notifications.md`](../../prds/2026-09-27-memory-shoebox/tech-specs/apis/notifications.md)
§ 1 `sign_in_code`. This document records only what is specific to building
them, and cites rather than restates.

## What this delivers

Everybody who can get in, and everything that decides what they can see: the
eight routes of `auth.md`, the anonymous `GET /api/public-settings` the sign-in
page needs, the `sign_in_code` email end to end on step 2's queue, the auth
middleware that replaces step 2's authenticator seam, and the visibility
predicate with its `(memberId, visibilityGeneration)` cache and the bump helper
that invalidates every viewer at once.

No surface. This is `apps/server` and `packages/shared` only.

## What already exists, and what it settles

Steps 1 and 2 removed most of the decisions this step would otherwise make.
Worth reading before the plan:

| File                                                               | What it already settles                                                                                                                         |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/server/src/http/requestContextHelpers.ts`                    | `Viewer`, the `onRequest` decoration, `requireViewer`, and the `Authenticator` seam this step fills. Everything that **reads** a viewer is done |
| `apps/server/src/http/rateLimit/rateLimit.constants.ts`            | Four of this step's five rules already named, including the shared per-address sign-in bucket                                                   |
| `apps/server/src/http/ApiError.ts`                                 | The status table as named constructors, and `registerErrorHandler` turning a `ZodError` into `400 invalid_request` with `details.fieldErrors`   |
| `apps/server/src/mail/enqueueEmail.ts`                             | Writes inside the caller's transaction, never throws on a mail problem, scrubs a terminal `sign_in_code` row on the way in                      |
| `apps/server/src/mail/templates/signInCodeTemplate.ts`             | The copy, the subject carrying the digits, the footer with no preferences link                                                                  |
| `apps/server/src/jobs/runSessionSweep.ts`, `runSignInCodeSweep.ts` | Both sweeps already have real bodies and tests. This step verifies them rather than writing them                                                |
| `apps/server/src/settings/readInstanceSettings.ts`                 | Reads any set of keys through `SETTING_DEFINITIONS`, so a fresh Shoebox with zero rows answers every key                                        |
| `apps/server/src/db/migrations/0001_identity_and_access.ts`        | `members`, `sign_in_codes`, `sessions`, `invitations`, `groups`, `group_members`, with `UNIQUE (token_hash)` and `(email, created_at DESC)`     |
| `packages/shared/src/settings.ts`                                  | `isPubliclyReadable`, true for `shoebox.name` and `public.base_url` only, and `visibility.generation` with a default of 0                       |

## Decisions

### 1. The pepper is derived from `SESSION_SECRET`

`data-models.md` § `sign_in_codes` puts the pepper "in the app config", and the
config has none. It has `SESSION_SECRET`, documented as encrypting the login
cookie, which is parsed and then read by nothing: the contract's cookie is 256
bits of CSPRNG output whose SHA-256 is stored in `sessions`, so there is no
cookie to sign or encrypt and never was.

So the pepper is `HKDF-SHA256(SESSION_SECRET, info: "sign-in-code-pepper")`,
derived once at startup through `node:crypto`. One secret for a self-hoster to
generate, no new variable on an existing `.env.local` or in the Fly secrets, and
a derivation rather than the raw bytes so that a later use of the same secret
cannot be a second use of the pepper. `.env.example` and
`docs/configuration.md` gain the correction: the variable protects sign-in
codes, and it does not encrypt a cookie.

**Rotating it invalidates every live code and no session**, which is the right
blast radius: codes last ten minutes, and sessions are rows rather than signed
tokens.

### 2. The cookie is read and written by hand

`shoebox_session` is the only cookie in the product. Reading it is finding one
name in `request.headers.cookie`; writing it is one `Set-Cookie` header with
the five attributes `conventions.md` fixes (`HttpOnly`, `Secure`,
`SameSite=Lax`, `Path=/`, `Max-Age=2592000`). `@fastify/cookie` would be a
dependency, a plugin registration and a signing facility we must not use, for
twenty lines.

One module owns both directions and the clearing header, so the attributes are
written once. The clearing form is the same attributes with `Max-Age=0`, which
matters because a browser drops a `Set-Cookie` that does not match the original
on `Path` and `Secure`.

**`Secure` is unconditional**, including in development. Chrome and Firefox
both treat `http://localhost` as a secure context, so the local flow works; a
conditional attribute would mean the cookie that development exercises is not
the cookie production sets.

### 3. The middleware reads the session and the generation on every request

`conventions.md`: "Looked up in the database on every request... That rules out
a stateless JWT and any cache without an invalidation channel. An auth library
will quietly violate this."

The authenticator runs as step 2's `onRequest` hook and does, for a request
carrying a cookie:

1. one `sessions` lookup by `token_hash` joined to `members`, filtered
   `expires_at > now`;
2. one read of `visibility.generation` from `settings`;
3. the `visibleRuleIds` expansion, from cache when the key matches;
4. the throttled slide, when it is due.

A request with no cookie does none of it. Step 2 is exact about the ordering
reason: `onRequest` is early enough that the rate limiter, which is a
`preHandler`, can read the viewer.

**The generation is read per request rather than cached.** It is one row by
primary key on a table that holds at most nine, in process, next to a lookup
that is already happening. Caching it is exactly how "a group edit invalidates
every viewer's cache at once and nobody keeps stale access" quietly stops being
true, and the cost of being right is a read that does not reach a disk.

**A member whose `status` is not `active` has no session.** The join filters on
it, so removing somebody ends every device they hold on its next request,
without the removal path having to find their rows. An `invited` member cannot
hold a session at all, because redeeming a code is what makes them `active`.

### 4. The slide is throttled on both rows, by the same rule

`sessions.last_used_at` and `expires_at` move only when the remaining lifetime
has moved by more than a day, which is the same thing as `last_used_at` being
more than a day old. `members.last_seen_at` is throttled identically. One
predicate, applied to two writes, both skipped entirely on the common request.

Without it a timeline page of thumbnails is dozens of writes serialising on
SQLite's single writer. `auth.md` notes the visible consequence and calls it
correct: a device can read "29 days left" immediately after use.

### 5. `visibleRuleIds` is expanded for every role, and one function applies it

`conventions.md` § The visibility predicate gives the expression and says an
admin "omits the clause entirely, which is both correct and fastest". Two ways
to honour that, and they fail differently:

| Shape                                             | An admin's `visibleRuleIds` | How a route that ignores the helper fails |
| ------------------------------------------------- | --------------------------- | ----------------------------------------- |
| Skip the expansion for admins                     | `[]`                        | The admin sees nothing. Loud              |
| **Expand for everybody, drop the clause for one** | The real set                | The admin sees slightly less. Silent      |

Neither leaks. The second is chosen anyway, because the field then never lies
and because `notifications.md` § Recipient resolution reuses this same cached
expansion for members of every role. The safety comes from there being one
sanctioned reader: `applyVisibilityFilter(query, viewer)` returns the query
untouched for an admin and adds
`visibility_rule_id IN (:visibleRuleIds) OR uploaded_by = :me` for everybody
else.

**Every later read route composes that function rather than rewriting the
expression.** That is what makes a count and the page it heads incapable of
disagreeing, and it is the interface this step exists to produce. Step 3a has
no item route of its own, so its only callers are tests, which seed `items` and
assert through it.

**`item_people` must never appear in it.** Being in a photograph is not a key
to it (`data-models.md` § The evaluation, Decision 7). The guard is a named
test: an item restricted to admins and people-tagged for a viewer is invisible
to that viewer.

### 6. The cache is keyed by the generation, and every write that changes an answer bumps it

The cache is a process-local `Map` from `memberId` to the expanded ids, held
alongside the generation it was built under. A different generation clears the
whole map rather than evicting per key: the map holds one entry per member of a
nine-person family, and a stale entry surviving its generation is the one
failure it must not have.

Process-local is enough, and only because the deployment is a single Fly
machine (`docs/architecture.md`). That is written down here because a second
machine would make this cache wrong, not slow.

**The bump list is longer than the sentence in `conventions.md`, and a missed
bump is invisible.** The document names group membership, a rule's subjects,
and a member's role. Minting a rule has to bump as well, and it is the easiest
one to miss:

| Write                                                 | Step | Why it bumps                                                                                                                                       |
| ----------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `group_members` insert or delete                      | 8a   | Named                                                                                                                                              |
| `visibility_rule_subjects` insert or delete           | 6a   | Named                                                                                                                                              |
| `members.role` change                                 | 8a   | Named                                                                                                                                              |
| **`visibility_rules` insert**                         | 6a   | A new rule naming a viewer is not in that viewer's cached set, so a brand-new upload would be invisible until some unrelated edit happened to bump |
| Member removal (`status`, plus its group memberships) | 8a   | The group deletes are covered, and the status change ends their sessions on the next request anyway                                                |

`bumpVisibilityGeneration(executor)` takes the caller's transaction, so the
bump commits with the write that earned it or not at all. It is exported for
steps 5a, 6a and 8a and is called nowhere in this step, which is why its test
is direct rather than through a route.

### 7. Redemption is one `BEGIN IMMEDIATE` transaction

`data-models.md`: "Submitting a code must be one transaction, or two concurrent
submissions each get three attempts." Kysely's SQLite dialect issues a deferred
`BEGIN`, which upgrades to a write lock only at the first write, so two readers
can both pass the attempt check. `database.connection()` plus the raw
`BEGIN IMMEDIATE`, `COMMIT` and `ROLLBACK` statements is what gets the write
lock at the start, in one helper in `src/db/`, reusable by every later slice
that needs the same guarantee (`data-models.md` § The last admin is the next
one).

### 8. The first sign-in seed needs a `uuidv7()` SQL function

Decision 3's seed is one statement over every item that exists, and `auth.md`
is specific about why: "a uuidv7 minted per row in application code turns one
statement into roughly 17,000 round trips". `item_views` shipped with a uuid
`id` and no default (`0007_operations_and_audit.ts`; the composite-key
exception `data-models.md` § One measured exception to the uuid rule offers was
not taken, and a shipped migration is never edited).

So `db/client.ts` registers `uuidv7()` as a user-defined function on the
better-sqlite3 connection, from the same `uuidv7` package `createId()` already
wraps, and the seed reads
`INSERT INTO item_views (id, member_id, item_id, first_seen_at) SELECT uuidv7(), :me, i.id, :now FROM items i ON CONFLICT DO NOTHING`.

**This is a step 1 file changed for a step 3a reason**, which `AGENTS.md`
§ Scope asks to be declared rather than done quietly. It is additive: no
existing query changes, and the function is available to every later slice that
needs a set-based insert.

The seed carries **no visibility predicate**, by Decision 3: the accent dot
means "arrived since you joined", not "you may see it", and filtering here
would light up old photographs later when a rule changed.

### 9. `ShellSettings` rides on two routes, and `MeDto` stays frozen

`auth.md` Ruling 1 and `administration.md` both say `CreateSessionResponse`
carries `shoebox.name`, `pile.arrangement` and `shoebox.timezone` resolved,
because they are session bootstrap rather than a second fetch. Neither says
where the shell gets them on a reload, when the member has a cookie and never
calls `POST /api/auth/session` again, and `pile.arrangement` is deliberately
not publicly readable so the anonymous route cannot serve it.

One named shape, `ShellSettings`, on both:

```ts
type ShellSettings = {
  shoeboxName: string;
  pileArrangement: "tidy" | "messy";
  timezone: string;
};

type MeResponse = { me: MeDto; settings: ShellSettings };

type CreateSessionResponse = {
  me: MeDto;
  session: SessionDto;
  isFirstSignIn: boolean;
  settings: ShellSettings;
};
```

`MeDto` itself is untouched, which keeps the shape `auth.md` froze. `GET` and
`PATCH /api/me` both answer `MeResponse`, so the resource has one read shape
and the client one parser; `PATCH` costs the same one extra settings read, on a
route somebody presses by hand.

Recorded as a deviation from `auth.md`, which writes both as `MeDto`.

### 10. `publicReadPerIp` is a new rule, not the sign-in one

`administration.md` says `GET /api/public-settings` "takes the per-IP bucket in
`conventions.md` § Rate limits". The only per-IP row there is
`signInCodeRequestPerIp`, twenty an hour, which is a cap on mail somebody can
aim at an inbox. This route is what renders the sign-in page's top bar, so
twenty an hour locks out anybody who reloads a slow page, which on surface 1 is
the least technical person in the family.

A new named rule, `publicReadPerIp`, 120 a minute, added to
`rateLimit.constants.ts` and recorded as an addition to `conventions.md`
§ Rate limits in the same way `auth.md` records the shared address bucket. The
document's intent, that the one anonymous read has a cap, is kept; its only
per-IP number, aimed at a different route, is not reused for it.

### 11. The device label is parsed once here and never re-parsed

`sessions.device_label` is stored so "a parser upgrade never relabels an
existing device", and `user_agent` holds the raw string as the fallback and is
never serialised. A hand-rolled parser covers the platform and browser tokens
this audience presents (iPhone, iPad, Mac, Windows, Android, Linux; Safari,
Chrome, Firefox, Edge, Samsung Internet), composes "iPhone, Safari", and falls
back to a truncated raw string when it recognises neither half.

Chrome and Edge both claim Safari in their UA strings and Edge claims Chrome,
so the browser match is ordered most-specific first. That ordering is the whole
of the parser's cleverness and it gets a test naming each browser.

A dependency would handle every UA in the wild, and would be a runtime
dependency plus a data file to keep current, for a two-word string that has a
stored fallback when it is wrong and whose only job is to be recognisable to
the person holding the device.

### 12. Unknown and known addresses share one path, and the test asserts bytes rather than milliseconds

`POST /api/auth/sign-in-codes` writes a `sign_in_codes` row for any address,
mails only when `member_id` is not null and the member's `status` is `invited`
or `active`, and answers `202` with the echoed address and `expiresAt` in every
case. The member lookup happens, because `member_id` goes on the row; what
never happens is a branch in the status, the body or the headers.

The step asks for a test that the two are identical in "status, body and timing
class". The first two are asserted byte for byte, including `Content-Length`.
The third is asserted structurally rather than on a clock: the test asserts
that no provider is called in band, which is the property that would make the
branches differ observably. A wall-clock assertion over one local `INSERT` is a
flaky test rather than a security property, and `auth.md` says the same thing
from the other side: "Do not add a sleep to mask it".

Three more places the same rule bites, each with its own test: a removed member
takes the unknown branch exactly, including through the wrong-code and
exhausted-attempts states; the per-address limiter counts non-members too, or
a missing `429` answers the question the route refuses to; and no mail failure
ever reaches this response.

### 13. The `410` that promises a new code mints one

The third wrong attempt sets `invalidated_at`, mints and enqueues a replacement
by the resend rules (member-only enqueue, shared per-address budget), commits,
and answers `410 sign_in_code_attempts_exhausted` with a message saying a new
code is on its way. The mockup's "Two tries left before we send you a new one"
is a promise, and `auth.md` Ruling 2 confirms the server keeps it.

`attemptsRemaining` is read off the row after the increment, never computed
from a constant, so a `max_attempts` that differs on an older row stays true.

### 14. Signing out cannot fail, and the two sign-out routes stay one behaviour

`DELETE /api/auth/session` answers `401 not_signed_in` only when no cookie was
presented at all. A cookie that no longer resolves gets `204` and the clearing
header, which is the carve-out `conventions.md` grants and the one route that
must not call `requireViewer`. `DELETE /api/me/sessions/:sessionId` deletes with
ownership in the `WHERE` clause and reads `changes() = 0` as `404`, so the
route is structurally incapable of answering "that row exists but is not
yours", and it clears the cookie when the id is the caller's own.

## The visibility expansion, as one query

```sql
SELECT r.id FROM visibility_rules r
WHERE r.mode = 'everyone'
   OR (r.mode = 'only'   AND     EXISTS (SELECT 1 FROM visibility_rule_subjects s
                                          WHERE s.rule_id = r.id
                                            AND (s.member_id = :me
                                                 OR s.group_id IN (SELECT group_id FROM group_members WHERE member_id = :me))))
   OR (r.mode = 'except' AND NOT EXISTS (… the same …))
```

One query, tens of rows out, over `group_members (member_id, group_id)`, which
`data-models.md` calls the second-hottest index in the product. Group
membership stays retroactive because the expansion runs at read time and
nothing is ever snapshotted. An `only` rule whose subjects no longer include
anybody fails closed, admins only, which is the safe direction.

## Module layout

```
apps/server/src/
├── auth/
│   ├── createAuthenticator.ts        the Authenticator: lookup, slide, viewer
│   ├── sessionCookie.ts              name, attributes, read, set, clear
│   ├── createSessionToken.ts         256 bits of CSPRNG, and its SHA-256
│   ├── makeCodeHashFromDigits.ts     HMAC-SHA256 with the derived pepper
│   ├── mintSignInCode.ts             supersede, insert, enqueue: one helper
│   │                                 shared by request, resend and exhaustion
│   └── getDeviceLabelFromUserAgent.ts
├── visibility/
│   ├── getVisibleRuleIdsFromMemberId.ts   the query above
│   ├── createVisibleRuleIdsCache.ts       keyed by generation, cleared on bump
│   ├── applyVisibilityFilter.ts           the one sanctioned reader
│   └── bumpVisibilityGeneration.ts        for 5a, 6a and 8a
├── db/runInImmediateTransaction.ts    BEGIN IMMEDIATE over one connection
├── routes/
│   ├── auth.ts                        the four sign-in and session routes
│   ├── me.ts                          account, notifications, devices
│   └── publicSettings.ts              anonymous, allow-list driven
└── config.ts                          + signInCodePepper, derived

packages/shared/src/
├── auth.ts        the slice's request and response schemas, MeDto, SessionDto,
│                  NotifyPreferences, MemberRole
└── settings.ts    + ShellSettings and PublicSettingsResponse, beside the
                   registry whose `isPubliclyReadable` flag drives the second
```

## The sign-in path, end to end

1. `POST /api/auth/sign-in-codes` normalises the address, and the middleware
   applies the two limits keyed on it before the handler runs.
2. Inside one transaction: `invalidated_at` on any live row for that address,
   then a new row with `HMAC-SHA256(digits, pepper)`, `expires_at = now + 10
minutes`, `max_attempts = 3`, and `member_id` when one matches.
3. When `member_id` is set and the member is `invited` or `active`,
   `enqueueEmail` writes one `outbound_emails` row with
   `idempotency_key = 'signin:<code_id>'`, inside the same transaction,
   ignoring `email_suppressions` and all four `notify_on_*` columns.
4. `202` with the normalised address and `expiresAt`, identical in every
   branch. The provider is never called in band.
5. `POST /api/auth/session` runs one `BEGIN IMMEDIATE` transaction: select the
   live row, constant-time compare, then increment and `401`, or exhaust,
   invalidate, mint a replacement and `410`, or consume and continue.
6. On success: delete the session the presented cookie resolves to, insert the
   new `sessions` row, write `members.last_signed_in_at`, and on a first
   sign-in set `joined_at` and `status = 'active'`, mirror
   `invitations.accepted_at`, and seed `item_views`.
7. `201` with `me`, `session` (`isCurrent` true), `isFirstSignIn`, and
   `settings`, plus the `Set-Cookie`. The response says nothing about how many
   rows the seed wrote.

## Contract additions

`packages/shared/src/auth.ts`, with the schema names `auth.md` fixes:
`requestSignInCodeRequestSchema`, `requestSignInCodeResponseSchema`,
`createSessionRequestSchema`, `createSessionResponseSchema`,
`updateMeRequestSchema`, `listMySessionsResponseSchema`,
`revokeMySessionParamsSchema`, and the plain-named `meDtoSchema`,
`sessionDtoSchema`, `notifyPreferencesSchema`, plus `meResponseSchema` and
`memberRoleSchema`. `packages/shared/src/settings.ts` gains
`shellSettingsSchema` and `publicSettingsResponseSchema`.

Request schemas are strict: `PATCH /api/me` rejects an unknown field rather
than ignoring it, `email` and `role` among them, so a client bug surfaces
immediately. `notify`, when present, requires all four booleans, which is what
keeps a partial write from looking like a bulk one. The 80-character display
name cap is applied in the request validator and deliberately stays out of the
schema and the database (`conventions.md` § String lengths).

Two of the three new error codes join `ApiError` as named constructors, so the
status table stays in one file: `sign_in_code_invalid`, which is a 401 that is
not `not_signed_in` and carries `details.attemptsRemaining`, and
`sign_in_code_attempts_exhausted`, whose message has to say that a replacement
is on its way. `sign_in_code_expired` is `ApiError.gone` and
`session_not_found` is `ApiError.notFound`, both unchanged, the second also
being the answer for another member's session id.

## Verification

`pnpm check` green, plus:

| Test                                                           | Asserts                                                                                                    |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Unknown address against a known one                            | Identical status, body and `Content-Length`, and no provider call on either branch                         |
| A removed member                                               | Identical to an unknown address through request, wrong code and exhaustion                                 |
| Sign a device out, then use it                                 | Its **next** request is `401`. This is what rules out a stateless token and any cache without invalidation |
| Add member B to a group                                        | B's `visibleRuleIds` changes with no new sign-in, and A's cached entry is invalidated by the same bump     |
| A hundred consecutive authenticated requests                   | At most one `sessions` slide and one `last_seen_at` write per day                                          |
| Two concurrent redemptions of one code                         | Three attempts in total, not six                                                                           |
| An item restricted to admins, people-tagged for a viewer       | Invisible to that viewer, through `applyVisibilityFilter`                                                  |
| An admin against an item restricted to somebody else           | Visible, with no clause in the query                                                                       |
| An uploader against their own item under a self-excluding rule | Visible, by clause 2                                                                                       |
| A first sign-in on a seeded archive                            | Every existing item gets `first_seen_at`, `first_opened_at` stays null, `open_count` stays zero            |
| The response of that first sign-in                             | Carries no count of anything, checked against the seeded item count                                        |
| `DELETE /api/auth/session` with a dead, expired or no cookie   | `204` and the clearing header for the first two, `401` only for no cookie at all                           |
| `GET /api/public-settings`                                     | Serves exactly the keys carrying `isPubliclyReadable`, answers on a Shoebox with zero settings rows        |
| The full "Arriving for the first time" flow                    | By hand, against a real inbox, including `wrong`, `expired` and `resent`                                   |

The by-hand run is the one the step names and cannot be automated: a real
address, a real code, and the four states surface 1 has to get right.

## Documentation

Per `AGENTS.md`, in the same change:

- `docs/auth.md`, new: the sign-in path, the session lifetime and its throttle,
  the cookie, the visibility predicate and what bumps the generation
- `docs/server.md`: the authenticator behind the seam it already describes, the
  three route modules, and `publicReadPerIp`
- `docs/configuration.md` and `apps/server/.env.example`: what `SESSION_SECRET`
  actually protects
- `docs/shared.md`: the auth slice's schemas
- `docs/architecture.md` § What is not built yet: sign-in exists now

## What this step deliberately leaves

Inviting anybody, changing a role, creating a group, and `GET /api/settings`
are step 8a's; this step reads groups and roles and lets nobody change them.
`bumpVisibilityGeneration` and `applyVisibilityFilter` ship with tests and no
production caller, because their callers are the steps that write visibility
and read the archive. Every surface is step 3b's and 4b's.
