# Authentication, sessions and my account

Surface 1 (Sign in) and surface 9 (My account): requesting a six-digit code,
redeeming one into a session, reading and correcting a member's own account,
and listing and revoking their own devices. Not here: the invitation lifecycle
and the invite email (`docs/api/members.md`, `docs/api/email.md`); an admin
signing out somebody else's device or changing somebody else's role
(`docs/api/members.md`); outbound email payloads, the failing-mail banner and
the delivery webhook (`docs/api/email.md`); the Shoebox name and the rest of
`SETTING_DEFINITIONS` (`docs/api/settings.md`); the auth middleware, the cookie
and the session slide, all settled in `conventions.md` § The auth middleware.

## Routes

| Method   | Path                             | Auth             | Role   | Purpose                                                       |
| -------- | -------------------------------- | ---------------- | ------ | ------------------------------------------------------------- |
| `POST`   | `/api/auth/sign-in-codes`        | anonymous        | none   | Ask for a six-digit code at an address.                       |
| `POST`   | `/api/auth/sign-in-codes/resend` | anonymous        | none   | Supersede the live code and issue a fresh one.                |
| `POST`   | `/api/auth/session`              | anonymous        | none   | Redeem a code, create a session, set the cookie.              |
| `DELETE` | `/api/auth/session`              | session required | viewer | Sign out the device making the request.                       |
| `GET`    | `/api/me`                        | session required | viewer | The signed-in member's own account.                           |
| `PATCH`  | `/api/me`                        | session required | viewer | Correct the display name; set the four notification switches. |
| `GET`    | `/api/me/sessions`               | session required | viewer | The member's own live devices.                                |
| `DELETE` | `/api/me/sessions/:sessionId`    | session required | viewer | Sign out one of the member's own devices.                     |

## Sign-in codes

#### `POST /api/auth/sign-in-codes`

**Surface** 1 `sign-in`, states `email`, `sent`, `unknown`, `link`
**Auth** anonymous · **Role** none
**Request**

```ts
/** Body. */
type RequestSignInCodeRequest = {
  /** Normalised (trimmed, lowercased) before anything else touches it. */
  email: string;
};
```

**Response** `202`

```ts
type RequestSignInCodeResponse = {
  /**
   * The normalised address, echoed so the copy can bold the canonical form.
   * Proves nothing: it is the caller's own input.
   */
  email: string;
  /** Ten minutes out. Identical whether or not the address is a member. */
  expiresAt: string;
};
```

`202`, not `200`: nothing has been sent when the response is written. The code
row is committed and an `outbound_emails` row is queued; the provider is never
called inside the request.

**Errors**

| Status | Code              | When                                                                                                      |
| ------ | ----------------- | --------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request` | `email` missing, or not parseable as an address. `details.fieldErrors`.                                   |
| 429    | `rate_limited`    | 5 per hour per address, 20 per hour per IP (`conventions.md` § Rate limits). `details.retryAfterSeconds`. |

**Transformations**

- Normalise the address, then **write a `sign_in_codes` row whether or not it
  belongs to a member** (`data-models.md` § `sign_in_codes`). `member_id` is the
  matching member's id, or null. One code path, one timing profile, one place
  to rate-limit.
- Generate six digits from a CSPRNG, store `HMAC-SHA256(digits, server_pepper)`
  in `code_hash`, never the digits. `expires_at = now + 10 minutes`,
  `max_attempts = 3`.
- Supersede whatever was live for that address first: set `invalidated_at` on
  any unexpired, unconsumed row for the same address, in the same transaction,
  so at most one code is ever live per address.
- Enqueue one `outbound_emails` row with `kind = 'sign_in_code'` and
  `idempotency_key = 'signin:<code_id>'` **only when `member_id` is not null**,
  and only when the member's `status` is `invited` or `active`. A removed
  member is treated exactly as an unknown address (`data-models.md`
  § Removing a member).
- The enqueue **ignores `email_suppressions` and all four
  `members.notify_on_*` columns**. A suppressed address still gets sign-in
  codes and they cannot be turned off, because without them there is no way
  back in (Decision 16).

**What the server does not do, and the response must not imply**

- It does not look up the member before deciding the status, the body or the
  headers. All three are byte-identical for a member, a removed member, an
  invited-but-never-signed-in member and an address nobody has ever heard of.
- It does not call Resend in-band, so a provider timeout cannot lengthen one
  branch and shorten the other. The only work that differs between branches is
  one local `INSERT` into `outbound_emails`, which is below network jitter. Do
  not add a sleep to mask it; do add a test that asserts the two responses are
  equal byte for byte, including `Content-Length`.
- It does not report a mail failure here, ever. Leaking "we could not send to
  that address" turns this form into a membership oracle. A failure lands in
  `outbound_emails.state = 'failed'` and surfaces only in the admin failing-mail
  banner (`data-models.md` § `outbound_emails`; `docs/api/email.md`).
- It offers no companion route that says whether an address is invited, known
  or suppressed, and no slice may add one. The invitation link carries the
  address as a plain query parameter purely so the field arrives pre-filled
  (Decision 2); nothing validates it before submission.
- The rate limiter keys on the **normalised address regardless of membership**.
  Counting only members would make the limiter itself the oracle: five probes
  and a missing `429` would answer the question the rest of this route refuses
  to answer.
- It is never told where a `link`-state sign-in was heading. The client keeps
  the deep link and navigates to it after `201`; if the item is invisible, the
  item route answers `404`, identical to a nonexistent id
  (`conventions.md` § Errors).

**The copy correction this route forces.** States `sent` and `unknown` are one
response. The prototype gives them different ledes ("We sent a six-digit code
to abuela@example.com" against "If somebody@example.com is in this Shoebox, a
six-digit code is on its way there now"), and the assertive one is a claim the
server cannot make and must never be able to make. **The conditional wording is
the only correct copy, and it is used for every outcome of this route.**
`prototypes/src/surfaces/SignIn.tsx` needs that change; its own state note
("byte for byte the same as a known address") already says why.

**Performance** Index `(email, created_at DESC)` serves both the supersede and
the later redeem. Two or three small writes in one transaction. The per-IP
limiter is the one place an IP is touched, in memory, never stored, never
logged (`data-models.md` § Privacy).

---

#### `POST /api/auth/sign-in-codes/resend`

**Surface** 1 `sign-in`, states `resent`, `wrong`, `expired`
**Auth** anonymous · **Role** none
**Request** identical to `RequestSignInCodeRequest`.
**Response** `202` `RequestSignInCodeResponse`
**Errors** identical to `POST /api/auth/sign-in-codes`, including the two rate
limits, which it **shares** rather than doubling.

**Transformations**

- Same handler, same statements, same response as
  `POST /api/auth/sign-in-codes`. The split exists so the client's state machine
  can distinguish "Send another" (state `resent`, which says plainly that the
  old code has stopped working) from a first request (state `sent`). The server
  behaves identically, and deliberately: a route that behaved differently
  depending on whether a code was already outstanding would leak that fact.
- The supersede is the point rather than a side effect. `invalidated_at` on the
  previous row is what makes "the old one has stopped working" true, and it is
  a state on the row, not an inference from expiry
  (`data-models.md` § `sign_in_codes`).
- **It shares the per-address mint budget** with
  `POST /api/auth/sign-in-codes`: five per hour across both routes, not five
  each. A separate bucket would double the mail an attacker can aim at somebody
  else's inbox and reopen the probe the limit exists to close. This is an
  addition to `conventions.md` § Rate limits; see Open questions.
- The client may call this without ever having called the first route (somebody
  reloads the page and presses "Send another"). That is fine: it mints.

**Performance** As above.

---

## Session

#### `POST /api/auth/session`

**Surface** 1 `sign-in`, states `sent`, `wrong`, `expired`, `unknown`, `link`
**Auth** anonymous · **Role** none
**Request**

```ts
/** Body. */
type CreateSessionRequest = {
  /** Normalised before use. */
  email: string;
  /**
   * Exactly six digits, as typed. Pasted values are stripped of whitespace by
   * the client.
   */
  code: string;
};
```

**Response** `201`

```ts
type CreateSessionResponse = {
  me: MeDto;
  /** The device this request just created. `isCurrent` is always true here. */
  session: SessionDto;
  /**
   * True the first time this member ever signed in. Carries no count of
   * anything (see Transformations).
   */
  isFirstSignIn: boolean;
};
```

Plus `Set-Cookie: shoebox_session=<token>; HttpOnly; Secure; SameSite=Lax;
Path=/; Max-Age=2592000` (`conventions.md` § The auth middleware). The token is
256 bits of CSPRNG output; only its SHA-256 is stored.

**Errors**

| Status | Code                              | When                                                                                                                        |
| ------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request`                 | Missing field, malformed address, or a code that is not six digits. `details.fieldErrors`.                                  |
| 401    | `sign_in_code_invalid`            | A live code exists and the digits are wrong, with tries left. `details.attemptsRemaining`. Drives state `wrong`.            |
| 410    | `sign_in_code_expired`            | No live code for that address: never requested, past `expires_at`, already consumed, or superseded. Drives state `expired`. |
| 410    | `sign_in_code_attempts_exhausted` | That wrong attempt was the last one. The row is invalidated and a replacement has been issued. Drives state `resent`.       |
| 429    | `rate_limited`                    | 10 per hour per address, on top of the per-code attempt cap. `details.retryAfterSeconds`.                                   |

Every one of these is reached identically by a member and by an address that is
not a member. The unknown address has a real row with a real `code_hash`, so it
counts down from three tries and expires after ten minutes exactly as a
member's does. That is the whole reason the row is written
(`data-models.md` § `sign_in_codes`).

**Transformations**

**One transaction**, `BEGIN IMMEDIATE`, or two concurrent submissions each get
three attempts (`data-models.md` § `sign_in_codes`). Inside it, in order:

1. Select the newest row for the normalised address where `consumed_at IS
NULL AND invalidated_at IS NULL AND expires_at > now`, using
   `(email, created_at DESC)`. At most one exists, because every mint
   supersedes. None means `410 sign_in_code_expired`; nothing else is
   attempted and nothing is written.
2. Constant-time compare `HMAC-SHA256(submitted_digits, server_pepper)` against
   `code_hash`. A length-independent compare, so the comparison itself times
   the same on every input.
3. **Mismatch**: `attempts = attempts + 1`. If `attempts < max_attempts`,
   commit and return `401` with
   `attemptsRemaining = max_attempts - attempts`, computed from the row after
   the increment, never from a constant. The first wrong code of three gives
   `2`, which is the mockup's "Two tries left" exactly. If `attempts` now
   equals `max_attempts`, set `invalidated_at`, mint and enqueue a replacement
   by the same rules as `POST /api/auth/sign-in-codes/resend` (including the
   member-only enqueue and the shared per-address budget), commit, and return
   `410 sign_in_code_attempts_exhausted`. This is the mockup's promise: "Two
   tries left before we send you a new one".
4. **Match, but `member_id` is null, or the member's `status` is `removed`**:
   take branch 3 unchanged, including the increment, the exhaustion path and
   the response. A correct guess against an address with no usable member is
   one chance in a million per attempt and must not be distinguishable from a
   wrong one.
5. **Match, with a member whose `status` is `invited` or `active`**: set
   `consumed_at`. Single use is that column being null
   (`data-models.md` § `sign_in_codes`).
6. If the request arrived carrying a `shoebox_session` cookie that still
   resolves, delete that session row. The cookie is about to be overwritten, so
   leaving the row live would strand an unreachable device in somebody's list
   with no way to recognise it.
7. Insert the `sessions` row: `token_hash` (SHA-256 of the cookie value; a fast
   hash is correct here because the token has real entropy, unlike six digits),
   `device_label` parsed once from the `User-Agent` and stored so a later parser
   upgrade never relabels an existing device, `user_agent` stored raw as the
   fallback and **never returned in any payload**, `last_used_at = now`,
   `expires_at = now + 30 days`.
8. Write `members.last_signed_in_at = now`, unthrottled: it is once per
   redemption, not once per request, and it is a different fact from
   `last_seen_at`, which the middleware throttles
   (`data-models.md` § `members`).
9. **First sign-in only** (`members.joined_at IS NULL`): set `joined_at = now`
   and `status = 'active'`, which is what accepting an invitation is
   (Decision 2); set `invitations.accepted_at` on this member's open invitation
   row, mirroring `joined_at` (`data-models.md` § `invitations`; the invitation
   lifecycle otherwise belongs to `docs/api/members.md`, only this one write
   happens here); and seed `item_views`.
10. **The seeding**, Decision 3. One statement:
    `INSERT INTO item_views (id, member_id, item_id, first_seen_at) SELECT <id>,
:me, i.id, :now FROM items i ON CONFLICT DO NOTHING`. Every item that
    already exists, **with no visibility predicate**: the accent dot means
    "arrived since you joined", not "you may see it", and filtering here would
    light up old photographs later when a rule changed. Roughly 17,000 rows for
    a nine-person Shoebox, once, in milliseconds. It writes `first_seen_at`
    only: `first_opened_at` stays null and `open_count` stays zero, so a new
    member does not appear on surface 17 as having opened the entire archive.

**The response must not reveal how many items were seeded.** No `seededCount`,
no `itemCount`, no array length that tracks it, no timing claim in the body.
The number is the size of the whole archive rather than a viewer-filtered
count, so publishing it would tell a brand-new viewer exactly how much exists
beyond what they can open, which is the counting rule's single worst failure
(`data-models.md` § One rule that outranks the others).

`isFirstSignIn` is permitted because it carries no count: it says only that
this member has not signed in before, which they know. It exists so the client
can show the one-time line Decision 3 asks for, the one that says the size of
the archive in words rather than in dots. **The words in that line are a
viewer-filtered count and must come from the timeline
(`docs/api/timeline.md`), not from this response.**

For state `link`, the request and response are unchanged. The destination never
reaches the server.

**Performance** `(email, created_at DESC)` for the lookup;
`UNIQUE (token_hash)` is created here and read on every subsequent request
including every thumbnail. The transaction holds SQLite's single writer for the
length of the seed, once in a member's life; every other sign-in is three small
writes. The seed must be one `INSERT ... SELECT`, so the row ids have to be
generated in SQL: a uuidv7 minted per row in application code turns one
statement into roughly 17,000 round trips. `item_views` is one of the tables
flagged for the composite-primary-key exception, and this is the statement that
makes the case (`data-models.md` § One measured exception to the uuid rule).

---

#### `DELETE /api/auth/session`

**Surface** 9 `account`, state `sign-out-current`
**Auth** session required · **Role** viewer
**Request** no body, no parameters. The session is the one identified by the
cookie.
**Response** `204`, no body, plus
`Set-Cookie: shoebox_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`.

**Errors**

| Status | Code            | When                                              |
| ------ | --------------- | ------------------------------------------------- |
| 401    | `not_signed_in` | No `shoebox_session` cookie was presented at all. |

A cookie that is presented but no longer resolves (already signed out from
another device, or expired) returns `204` and the clearing header rather than
`401`. Sign-out must never fail, and the header is the only thing the client
actually needs. This is the one carve-out this slice asks of the middleware;
see Open questions.

**Transformations**

- `DELETE FROM sessions WHERE id = :viewer.sessionId`. Nothing is soft-deleted:
  the row appears at sign-in and vanishes at sign-out, and there is no durable
  device record underneath it (`data-models.md` § `sessions`).
- It stops working immediately, everywhere, because the middleware looks the
  session up in the database on every request rather than trusting a token
  (`conventions.md` § The auth middleware). That promise is the reason a
  stateless JWT is ruled out.
- `members.last_seen_at` is not touched. Signing out is not being seen.

**What the client does.** This route and
`DELETE /api/me/sessions/:sessionId` with the member's own current id have the
same effect; this one exists so the client need not know its own session id to
leave. On `204` the client discards its cached `MeDto`, clears any in-memory
deep link, and navigates to the sign-in surface in state `email`. The confirm
copy is different from the other device's ("You are using this one... you will
need a fresh six-digit code to get back in, on this device") because the
consequence is different, not because the route is.

**Performance** One delete by primary key.

---

## My account

#### `GET /api/me`

**Surface** 9 `account`, states `default`, `notifications-off`
**Auth** session required · **Role** viewer (every signed-in member)
**Request** no parameters.
**Response** `200` `MeDto`

**Errors**

| Status | Code            | When             |
| ------ | --------------- | ---------------- |
| 401    | `not_signed_in` | No live session. |

**Transformations**

- `member.displayName` is the resolved name: the stored `display_name`, falling
  back to the email local part when it is null (Decision 1). `storedDisplayName`
  is the raw column, so the form can show the fallback as a placeholder rather
  than as text the member appears to have typed.
- `email` is the member's **own** address, which is why it may appear here at
  all. `MemberRef` carries no email and is not widened
  (`conventions.md` § The frozen DTOs); this route is not admin-scoped, it is
  self-scoped, and it returns exactly one address: the caller's.
- All four notify booleans are returned for every role, including a viewer,
  whose `onRemoval` preference is stored and preserved even though a viewer
  never receives a removal email (`data-models.md` § `members`). The recipient
  query filters on role as well as on the boolean; hiding the field here would
  lose the member's setting the moment an admin promoted them.
- `role` is read from the row on this request, so a demotion takes effect on the
  next one. The visibility side of a role change is handled by the
  `visibility.generation` bump, not here.

**Performance** One row by primary key, already loaded by the middleware.

---

#### `PATCH /api/me`

**Surface** 9 `account`, states `default`, `notifications-off`
**Auth** session required · **Role** viewer (every signed-in member)
**Request**

```ts
/** Body. Every field is optional; an omitted field is left alone. */
type UpdateMeRequest = {
  /**
   * Trimmed. `null` or `""` clears it back to the email local-part fallback.
   */
  displayName?: string | null;
  /**
   * All four, always, when present. There is no fifth field and no "turn them
   * all off" flag.
   */
  notify?: NotifyPreferences;
};
```

**Response** `200` `MeDto`, the post-mutation read shape.

**Errors**

| Status | Code              | When                                                                                                                                                |
| ------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request` | An unknown field (`email` and `role` among them), a `notify` object missing one of the four, or a display name over the cap. `details.fieldErrors`. |
| 401    | `not_signed_in`   | No live session.                                                                                                                                    |

**Transformations**

- **"Turn them all off" is a client convenience, not an API feature.** The
  button sends one `PATCH` with all four booleans false, and "Turn them back on"
  sends all four true. There is no `notifyAll` column, no fifth switch and no
  bulk endpoint (Decision 16, `data-models.md` § `members`). Requiring all four
  whenever `notify` is present is what keeps a partial write from looking like
  a bulk one.
- **Sign-in codes are not on the list and cannot be switched off.** No value of
  any of the four changes whether a code is sent, and neither does an entry in
  `email_suppressions` (Decision 16). The Account banner says this; the API
  makes it true by never consulting these columns in the sign-in path.
- **`email` is not writable, here or anywhere.** It is the identity, not a
  detail on the account: it is what the member was invited at and what the code
  goes to, so there is no change flow and no verification column
  (`data-models.md` § `members`). Moving to another address is an admin inviting
  the new one and removing the old one, deliberately somebody else's action
  (`docs/api/members.md`). A request containing `email` is rejected rather than
  ignored, so a client bug surfaces immediately.
- `role` is not writable here either. A member cannot promote themselves, and
  the last-admin guard lives on the admin route (`data-models.md` § The last
  admin).
- A display name change does **not** bump `visibility.generation`. Only group
  membership, a rule's subjects and a member's role do
  (`conventions.md` § The auth middleware). Invalidating every viewer's cached
  rule set because somebody fixed their own spelling would be a real cost for
  nothing.
- The linked `people` row, if there is one, is untouched. A member's display
  name and a tagged person's name are two different names.

**Performance** One `UPDATE` by primary key, then return the row already in
hand. No re-read.

---

#### `GET /api/me/sessions`

**Surface** 9 `account`, states `default`, `sign-out-device`, `sign-out-current`
**Auth** session required · **Role** viewer (every signed-in member)
**Request** no parameters. No `limit`, no `cursor`.
**Response** `200`

```ts
type ListMySessionsResponse = {
  sessions: SessionDto[];
  /**
   * Always null. A member holds a handful of live devices, bounded by the
   * 30-day expiry.
   */
  nextCursor: null;
};
```

**Errors**

| Status | Code            | When             |
| ------ | --------------- | ---------------- |
| 401    | `not_signed_in` | No live session. |

**Transformations**

- `WHERE member_id = :me AND expires_at > now`, ordered `last_used_at DESC`.
  The expiry filter is load-bearing: no background job deletes expired sessions
  (`conventions.md` § The job runner lists four, and this is not one of them),
  so a dead row would otherwise sit in the list looking live. See Open
  questions.
- **`isCurrent` is `row.id === viewer.sessionId`**, computed at the boundary.
  It is not a column and must not become one
  (`data-models.md` § Notes for whoever writes the API contract). It is what the
  UI turns into "this one" and into the danger-variant button.
- The current device sorts first without a special case, because it was just
  used.
- **Timestamps only.** `lastUsedAt` and `expiresAt` go out as ISO-8601 UTC. The
  mockup's "3 days ago", "30 days left" and "Falls out in 4 days" are all
  formatted in the browser, where the reader's locale is
  (`conventions.md` § Field naming). `daysIdle` in the fixtures is
  `now - lastUsedAt` and is not a field.
- **No IP address, no location, no raw user agent.** A device row is
  `deviceLabel` plus two timestamps, and that is the whole of it. `place` was
  dropped: city-level lookup means a 70MB GeoIP database and a key to separate
  devices that in a nine-person family are mostly in the same two cities
  (Decision 6). `sessions.user_agent` is stored as a fallback for a bad parse
  and is never serialised.
- `expiresAt` moves only when the middleware slides it, which it does only when
  the remaining lifetime has moved by more than a day. So this list can show a
  device as having 29 days rather than 30 immediately after use, and that is
  correct rather than stale (`conventions.md` § The auth middleware).

**Performance** One query on `(member_id, last_used_at DESC)`, tens of rows at
the very most. No join and no N+1: `isCurrent` comes from `Viewer`, and there is
nothing else to fetch.

---

#### `DELETE /api/me/sessions/:sessionId`

**Surface** 9 `account`, states `sign-out-device`, `sign-out-current`
**Auth** session required · **Role** viewer (every signed-in member; the row
must be their own)
**Request**

```ts
/** Path. */
type RevokeMySessionParams = {
  sessionId: string;
};
```

**Response** `204`, no body. When `sessionId` is the requesting session's own
id, the response also carries
`Set-Cookie: shoebox_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`.

**Errors**

| Status | Code                | When                                                                    |
| ------ | ------------------- | ----------------------------------------------------------------------- |
| 401    | `not_signed_in`     | No live session.                                                        |
| 404    | `session_not_found` | No such session, **or it belongs to somebody else**, or it has expired. |

**The `404` is not a `403`.** Another member's session id and an id that never
existed return the identical status, code and message. A `403` would confirm
that a session exists at that id, which is exactly what the rule exists to
prevent (`conventions.md` § Errors). `403` in this product is for role
restrictions only, and there is no role restriction here: every member may sign
out their own devices (`PRODUCT.md` § Roles). An admin signing out somebody
else's device is a different route and belongs to `docs/api/members.md`.

**Transformations**

- One statement: `DELETE FROM sessions WHERE id = :sessionId AND member_id =
:me`, then `changes() = 0` means `404`. Ownership is in the `WHERE` clause
  rather than in a preceding `SELECT`, which is both one round trip and
  structurally incapable of answering "that row exists but is not yours".
- The device stops working immediately, wherever it is, because the middleware
  reads `sessions` on every request. That is the promise the Account banner
  makes about a lost or handed-down phone, and it is the reason sessions are
  not stateless.
- Nothing else is written. No revocation log, no `revoked_at`, no audit row:
  the row is gone and `data-models.md` § What is _not_ logged is deliberate
  about that.

**What the client does, and why the route does not branch.** Signing out
another device and signing out this one are the same request with the same
`204`. The difference is entirely in the client:

| `sessionId`           | Confirm copy                                                             | After `204`                                                                  |
| --------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Another of my devices | Names the device; "stops working straight away".                         | Drop the row from the table in place. Stay on the surface.                   |
| `viewer.sessionId`    | "You are using this one"; a fresh six-digit code is needed to come back. | Discard the cached `MeDto`, honour the clearing cookie, navigate to sign-in. |

The client already knows which case it is, from `isCurrent` on the row it is
acting on. The server does not need to tell it twice, and a divergent response
shape would only give the two paths different failure modes.

**Performance** One delete by primary key with an extra equality predicate.

---

## Shared types in this slice

```ts
type MemberRole = "viewer" | "uploader" | "admin";

/**
 * The four switches on My account. Four boolean columns on `members`, not
 * settings rows (Decision 16).
 */
type NotifyPreferences = {
  /** Somebody puts photographs up. One email per batch. */
  onUpload: boolean;
  /** Somebody comments on something they uploaded. */
  onComment: boolean;
  /** Somebody comments on something they commented on. */
  onReply: boolean;
  /**
   * Somebody asks for a photograph to come down. Stored for every role; only
   * admins and uploaders are ever sent one.
   */
  onRemoval: boolean;
};

/**
 * The signed-in member's own account. Self-scoped, which is the only reason an
 * email address appears: it is the caller's own.
 */
type MeDto = {
  /**
   * The name and id the rest of the product uses. `displayName` is resolved,
   * falling back to the email local part.
   */
  member: MemberRef;
  /**
   * The raw `display_name` column: null when none has ever been set, so the
   * form can show the fallback as a placeholder.
   */
  storedDisplayName: string | null;
  /** Never writable, anywhere. This is the identity, not a field on it. */
  email: string;
  role: MemberRole;
  notify: NotifyPreferences;
  /**
   * First successful sign-in. Null only between invitation and first sign-in,
   * which is not a state this route can be called in.
   */
  joinedAt: string | null;
  /**
   * Written on every redemption. Distinct from the middleware's throttled
   * `lastSeenAt`, which is not published here.
   */
  lastSignedInAt: string | null;
};

/** One row of `sessions`. What My account calls a device. */
type SessionDto = {
  sessionId: string;
  /**
   * "iPhone, Safari". Parsed once at creation and stored, so a parser upgrade
   * never relabels an existing device.
   */
  deviceLabel: string;
  createdAt: string;
  /**
   * Slides, but only when the remaining lifetime has moved by more than a day.
   */
  lastUsedAt: string;
  /**
   * `lastUsedAt + 30 days`. Both "Stays until" and "Falls out in N days" are
   * formatted from this.
   */
  expiresAt: string;
  /**
   * `row.id === viewer.sessionId`. Computed at the boundary, never a column.
   */
  isCurrent: boolean;
};

/** `details` on a `401 sign_in_code_invalid`. */
type SignInCodeInvalidDetails = {
  /**
   * `max_attempts - attempts`, read off the row after the increment. Three
   * tries, so the first wrong code gives 2.
   */
  attemptsRemaining: number;
};
```

Schema names for the generated Zod dialect:
`requestSignInCodeRequestSchema` / `RequestSignInCodeRequest`,
`requestSignInCodeResponseSchema` / `RequestSignInCodeResponse`,
`createSessionRequestSchema` / `CreateSessionRequest`,
`createSessionResponseSchema` / `CreateSessionResponse`,
`updateMeRequestSchema` / `UpdateMeRequest`,
`listMySessionsResponseSchema` / `ListMySessionsResponse`,
`revokeMySessionParamsSchema` / `RevokeMySessionParams`, and the plain-named
shared ones `meDtoSchema` / `MeDto`, `sessionDtoSchema` / `SessionDto`,
`notifyPreferencesSchema` / `NotifyPreferences`.

## Error codes this slice appends

| Code                              | Status | Note                                                           |
| --------------------------------- | ------ | -------------------------------------------------------------- |
| `sign_in_code_invalid`            | 401    | Wrong digits, tries left. Carries `details.attemptsRemaining`. |
| `sign_in_code_attempts_exhausted` | 410    | The last try was used; a replacement code has been issued.     |
| `session_not_found`               | 404    | Also returned for a session belonging to another member.       |

`sign_in_code_expired` (410) is already in the registry and is used unchanged
for an expired, consumed, superseded or never-issued code.

## Additions requested to the frozen DTOs

None.

One was tempting and is deliberately not requested: an `email` field on
`MemberRef`. My account needs the member's own address, and widening
`MemberRef` would put an email on every author chip, every reaction list and
every people-tag row in the product. `MeDto` embeds `MemberRef` and carries the
address alongside it instead, so the only route that can serve an address to a
non-admin serves exactly one: the caller's own.

## Rulings

Every question this slice raised, answered. Three were already closed by the
merge and are marked as such rather than re-decided.

1. **The Shoebox name before anybody is signed in: a new anonymous route.**
   `GET /api/public-settings` is **anonymous** and returns an allow-listed
   subset of `SETTING_DEFINITIONS`, today `shoebox.name` and `public.base_url`
   and nothing else. It belongs to the administration slice beside
   `GET /api/settings`, which stays admin-only because it also carries the mail
   configuration and the storage figures. The administration slice asked the
   same question from the other side and gets the same answer.

   An anonymous name read is a fingerprint of the instance and not a membership
   oracle, which is the acceptable half of that trade. The allow-list is the
   guard: a key is readable anonymously because it is on that list, never
   because a route forgot to check.

   **What a signed-in member needs is a different question.** `pile.arrangement`
   and `shoebox.timezone` shape the timeline and belong to the session
   bootstrap, not to a second anonymous read. `CreateSessionResponse` carries
   all three resolved values.

2. **Automatic resend on the third wrong code: confirmed.** The server mints
   and sends a replacement when the attempts run out, and answers
   `410 sign_in_code_attempts_exhausted`. The mockup's "Two tries left before
   we send you a new one" is a promise, and the alternative reading strands the
   least technical person in the family at a dead end, which surface 1 is the
   one surface that cannot afford. The shared per-address mint budget caps what
   an attacker can aim at somebody else's inbox at five an hour across both
   routes.

   The `410` body must say a new code is on its way, or the copy and the status
   disagree.

3. **The shared rate-limit bucket: closed on merge.** `conventions.md`
   § Rate limits already reads "`POST /api/auth/sign-in-codes` and `/resend`,
   per address: 5 per hour, **shared**. Resend draws on the same bucket or it
   is a way round the cap."

4. **`attemptsRemaining` as a third `details` use: closed on merge.**
   `conventions.md` § Errors names three uses today, and `README.md` § What the
   merge changed records it.

5. **The sign-out carve-out: closed on merge.** `conventions.md` § The auth
   middleware ends with it: a dead, expired or absent cookie returns `204`,
   because a person pressing "sign out" and being told they are not signed in
   has been failed by the software rather than informed by it.

6. **The session sweeper: closed on merge.** `session-sweep` is in
   `conventions.md` § The job runner, hourly, and it is explicitly housekeeping
   rather than security: sessions are looked up per request, so an expired row
   is already dead.

7. **`displayName` is capped at 80 characters**, and every other string cap in
   the contract is now settled in one place rather than three:
   `conventions.md` § String lengths. It stays out of the schema deliberately,
   because the number is a product judgement and should be changeable without a
   migration.

8. **The one-time line after a first sign-in: confirmed as split.**
   `isFirstSignIn` on `CreateSessionResponse` is the trigger and carries no
   number. The count in that sentence is viewer-filtered and belongs to the
   timeline slice's own response, which is also where it cannot accidentally be
   taken from a seed.
