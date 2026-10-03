# API conventions

Binding on every route in `docs/api/`. Written before any slice, so that eight
documents produced in parallel merge into one contract rather than eight
dialects of one.

Where this file and a slice disagree, this file wins.

## Paths

- Everything under `/api`. Plural, kebab-case resource segments:
  `/api/items/:itemId`, `/api/removal-requests`, `/api/upload-sessions`.
- **There is no `/admin` prefix, ever.** Role is an attribute of a route,
  declared in its header, not a path segment. `/api/members` is one resource
  whose shape and writability vary by role.
- Nest sub-resources one level only: `/api/items/:itemId/comments`. Go deeper by
  promoting to top level: `/api/comments/:commentId/reactions`.
- Verbs only where REST cannot express the action, and then as a noun
  sub-resource: `POST /api/upload-sessions/:id/commit`,
  `POST /api/removal-requests/:id/decline`,
  `POST /api/items/:itemId/capture-date`. Never `POST /api/doSomething`.
- Path params are camelCase and suffixed `Id`: `:itemId`, not `:id`.
- **`PUT` on a sub-collection replaces it; `PATCH` applies a delta.** Which one
  is correct is decided by whether the viewer can see the whole collection. An
  item's tags and people are `PUT`, because a viewer who can open the item sees
  every tag on it. A milestone's items are `PATCH` with `attach` and `detach`,
  because the viewer's visible portion of that join table is not the join
  table, and a replace would silently detach photographs they cannot see. Do
  not harmonise these two into one verb.

## Envelope

- A single resource is the body. No wrapper.
- A collection is `{ "<resourceKey>": T[], "nextCursor": string | null }`, where
  `<resourceKey>` is the plural resource name (`days`, `members`, `comments`).
  Never a bare top-level array.
- A mutation returns the resource in its post-mutation read shape. `204` with no
  body only where there is genuinely nothing to return (sign-out, unreact).
- **`201` wherever a new id is minted**, with the new resource as the body and
  no `Location` header (the id is in the body, and every client here is the web
  app). `200` for every other successful mutation.

## Pagination

- Cursor only. Never offset (`data-models.md` § `items`: "Paginate on the date,
  not an offset"). `?limit=<n>&cursor=<opaque>`; the server caps `limit` and
  states the cap. `nextCursor: null` means the end.
- The cursor is opaque to the client. State per route what it encodes: the
  timeline encodes `captured_on`; everything else encodes the uuidv7 `id`, which
  sorts by creation (`data-models.md` § Conventions).

## Field naming

- JSON is camelCase; the database is snake_case; the mapping is mechanical.
- Timestamps: ISO-8601 UTC with milliseconds, field suffix `At` (`createdAt`).
- Calendar dates: `YYYY-MM-DD`, field suffix `On` (`capturedOn`, `startsOn`).
- **No formatted or relative date string may appear in a payload.** Send the
  timestamp; the browser formats it, where the reader's locale is
  (`data-models.md` § Notes for whoever writes the API contract).
- Counts: suffix `Count`, and every one of them is the viewer-filtered count.
- Ids: `<thing>Id`, a uuid string. Booleans: `is` / `has` / `can` prefix.

## Types

- Express every request and response as a TypeScript `type` in
  the document. **Do not write Zod.** Name the schema it will become, using the
  pattern already in `packages/shared` (`healthResponseSchema` /
  `HealthResponse`): `<routeName>ResponseSchema` and `<RouteName>Response`.
  Shared DTOs used by more than one route get plain names (`itemSummarySchema` /
  `ItemSummary`).
- All eight slices are written in parallel. One Zod dialect is generated from
  these types after the merge; eight hand-written dialects would not merge.
- `packages/shared` must stay importable from both sides: the server runs
  TypeScript through Node's type stripping, so anything imported at runtime is
  plain, erasable TypeScript (`docs/shared.md`).

### String lengths are settled here, not per slice

Three slices proposed caps for overlapping fields and would otherwise have
picked three numbers. One table, applied in one validator:

| Field                                                         | Cap  | Why that one                                                                                                                                                                   |
| ------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `comments.body`, `removal_requests.reason`, `.decline_reason` | 4000 | Every free-text field a person types shares one number. A second number is a second thing to get wrong, and the real limit on a removal reason is social rather than technical |
| `members.display_name`                                        | 80   | Enough for "Abuela Rosa", short enough that a comment chip cannot be used as a billboard                                                                                       |
| `tags.name`, `groups.name`                                    | 100  | A label, not a sentence                                                                                                                                                        |
| `milestones.name`                                             | 200  | "A week at the grandparents'" and rather more                                                                                                                                  |
| `item_renditions` alt text override                           | 2000 | Prose for a screen reader, and the generated string is far shorter                                                                                                             |

Per item: at most **50 tags** and **30 people**. Both are generous enough that
nobody meets them by accident and low enough that a bulk action cannot turn one
photograph into an index.

All of these are trimmed first, and all reject with
`400 invalid_request` + `details.fieldErrors`. None of them is in the schema:
SQLite would enforce them with a `CHECK` per column, and the numbers are a
product judgement that should be changeable without a migration.

### Objects of four properties or more get a name

`docs/rules/typescript.md` extracts any object with four properties or more,
and it matters more here than it does in ordinary code: an anonymous shape in
this contract becomes two differently named copies in `packages/shared`, one
invented by whoever builds the server and one by whoever builds the web app,
which is the exact disagreement the contract exists to prevent. Three were
extracted after the merge: `UploadedRendition`, `MailQueueHealth` and
`MailDeliveryFailure`.

**A discriminated union's arms are the exception, and were reviewed rather
than missed.** `ActivityDetail` and `MailDiagnosis` write their arms inline.
Counting the discriminant, one arm across both reaches four properties;
counting only data fields, none does. Naming every arm would add seven names
that say what the union already says, and would turn the union's definition
into a list of references you have to follow to read the shape. A later
conformance pass should leave them alone.

## The frozen DTOs

**Three things the field lists below do not say, settled when they were
built.** Every `id` validates as a uuid, which real UUIDv7 ids satisfy;
`apps/server/test/idsParseAsUuid.test.ts` is the standing check that the
generator and the validator still agree, because they are separate libraries
and a disagreement would fail only in a browser. Every timestamp is rejected
unless it is ISO-8601 UTC with exactly three fractional digits, and every
`MediaSource.url` is rejected unless it is an absolute `http` or `https` URL,
which is what stops a raw storage key being served as one. And the length caps
in § String lengths are **not** applied to these shapes: they are request-side
validation, and capping a response would make the web app throw on a value
that was legitimately stored before a cap changed.

**One inconsistency, kept rather than fixed.** `VisibilitySummary.subjects[].id`
is spelled `id`, which § Field naming says should be `<thing>Id`. It reads
fine nested inside a field that names the thing, and changing a frozen shape
that eight slices cite is worse than the inconsistency. Recorded so the next
reader does not take it as licence.

Settled. Use them by name. Do **not** redefine them, widen them inline, or
invent a near-duplicate. If your slice needs a field one of them lacks, put it
in your "Additions requested" section and keep using the frozen shape in the
route bodies.

```ts
type ReactionKind = "like" | "love" | "care" | "haha" | "wow" | "sad";

/** A signed, short-lived URL for one stored object. Never a storage key. */
type MediaSource = {
  url: string;
  expiresAt: string;
  width: number;
  height: number;
};

/** Everything needed to draw one print without a second request. */
type MediaRef = {
  thumb: MediaSource;
  display: MediaSource;
  /** Videos only. */
  poster: MediaSource | null;
  video: { webm: MediaSource | null; mp4: MediaSource | null } | null;
  durationMs: number | null;
  /** Always present: the generated string, or the override when one exists. */
  altText: string;
};

/** No email unless the route is admin-scoped. */
type MemberRef = {
  memberId: string;
  displayName: string;
};

/** Never carries memberId. A tagged person is not an account. */
type PersonRef = {
  personId: string;
  displayName: string;
};

type TagRef = {
  tagId: string;
  name: string;
};

type MilestoneRef = {
  milestoneId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  blurb: string | null;
};

type VisibilitySummary = {
  mode: "everyone" | "only" | "except";
  /**
   * "Just us two". Composed from the rule's subjects at read time, never
   * stored.
   */
  label: string | null;
  subjects: { kind: "member" | "group"; id: string; displayName: string }[];
};

type BurstSummary = {
  burstId: string;
  /** Per viewer. There is no stored frame_count, deliberately. */
  visibleFrameCount: number;
  startsAt: string;
  endsAt: string;
  /**
   * Resolved at read time: the cover if visible, else the earliest visible
   * frame.
   */
  coverItemId: string;
};

type ItemSummary = {
  itemId: string;
  kind: "photo" | "video";
  capturedAt: string;
  capturedOn: string;
  media: MediaRef;
  isUnseen: boolean;
  uploadedBy: MemberRef;
  visibility: VisibilitySummary;
  burst: BurstSummary | null;
};

type ReactionSummary = {
  /** Server-ordered by (count DESC, canonical position ASC). */
  kinds: { kind: ReactionKind; count: number; members: MemberRef[] }[];
  myKind: ReactionKind | null;
};

type CommentDto = {
  commentId: string;
  author: MemberRef;
  body: string;
  atSeconds: number | null;
  createdAt: string;
  /** Drives the "edited" marker. Not optional: see Decision 8. */
  editedAt: string | null;
  canEdit: boolean;
  canDelete: boolean;
  reactions: ReactionSummary;
};
```

## The three documented exceptions

Everything here deviates from a rule above, each was argued for on merge, and
each is written down so that a later reader does not "fix" it:

1. **`peopleCount` is not per viewer.** Every other count in the contract is
   filtered to the caller. A person's existence is not visibility-scoped, and
   surface 7's `zero` state depends on a directory that does not change shape
   per reader. It looks like a violation of the rule that outranks the others
   and is not one: the count is of `people` rows, not of items.
2. **`UploadSessionDetail` embeds a paged `files` array** rather than exposing
   a `GET .../files` sub-resource, and its cursor encodes `upload_files.position`
   rather than a uuidv7 id. The surface always wants progress and files
   together, and the manifest's order is the order it draws.
3. **`POST /api/upload-sessions/:sessionId/files/:fileId/complete` returns
   `progress` and `didSettle`** alongside the file, which is wider than "the
   resource in its post-mutation read shape". The alternative is a `GET` after
   each of 264 completes.

## Errors

One shape, everywhere. It **extends the `apiErrorSchema` already in
`packages/shared`** rather than replacing it: `error` was already carrying the
code, and `details` is added for the cases that need structured data.

```json
{ "error": "item_not_found", "message": "…", "details": {} }
```

`error` is a stable `snake_case` code and is machine-read. `message` is English
and is never the primary UI copy. `details` is optional, so is every field in
it, and a field joins it when a contract needs one, additively, changing no
existing response. Name your codes `<domain>_<condition>`.

| `details` field     | Type                       | Carried by                                                                                                    |
| ------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `fieldErrors`       | `Record<string, string[]>` | `400 invalid_request`: the failures, per field                                                                |
| `retryAfterSeconds` | integer                    | `429 rate_limited`                                                                                            |
| `attemptsRemaining` | integer                    | A wrong sign-in code: the attempts left before it is replaced                                                 |
| `sessionId`         | string                     | `409 upload_session_conflict` on opening a second batch, or cancelling a committed one: the batch in question |
| `fileId`            | string                     | `409 upload_file_conflict` on a hash collision: the row that already holds those bytes                        |
| `state`             | string                     | `409 upload_file_conflict`: the state the row is in                                                           |
| `clientRefs`        | `string[]`                 | `409 upload_manifest_conflict`: which picked files were refused                                               |

The four upload fields arrived with step 6a (its design's decision 11).

| Status | When                                                                                                                               | Canonical code                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 400    | Malformed, or failed validation                                                                                                    | `invalid_request` + `details.fieldErrors`    |
| 401    | No session, or an expired one                                                                                                      | `not_signed_in`                              |
| 403    | **Role or capability.** Signed in, the thing exists, the viewer may see it, and something other than visibility forbids the action | `<domain>_forbidden`                         |
| 404    | Does not exist, **or the viewer may not see it**                                                                                   | `<domain>_not_found`                         |
| 409    | State conflict                                                                                                                     | `<domain>_conflict`                          |
| 410    | A sign-in code that has expired or been superseded                                                                                 | `sign_in_code_expired`                       |
| 429    | Rate limited                                                                                                                       | `rate_limited` + `details.retryAfterSeconds` |
| 503    | A third party the route depends on is down while the database is fine                                                              | `<domain>_unavailable`                       |

The line between 403 and 404 is one question, not two: **404 means you may not
see it; 403 means you can see it and may not do it.** A viewer asking to remove
a photograph they are not tagged in gets 403, because they are looking at the
photograph and the refusal tells them nothing they did not already know. The
same viewer addressing an item outside their visibility gets 404, always.

**The 404 rule is absolute.** Any route addressing a row the viewer's visibility
predicate excludes returns a byte-identical 404 to a nonexistent id: same
status, same code, same message. This covers permalinks, comments, reactions,
removal requests, burst siblings and view records on an invisible item. A 403
confirms that something exists at that id, which is exactly what the counting
rule exists to prevent (`data-models.md` § The evaluation). Say so explicitly in
every route's error table where the route takes an item-derived id.

## The visibility predicate

Computed once per request by the auth middleware, never per route.

```sql
-- :visibleRuleIds is this viewer's expanded rule set
AND (i.visibility_rule_id IN (:visibleRuleIds) OR i.uploaded_by = :viewerMemberId)
-- an admin: omit the clause entirely, which is both correct and fastest
```

`item_people` must never appear in a visibility expression. Being in a
photograph is not a key to it (`data-models.md` § The evaluation, Decision 7).

## Who may change an item

"Uploader" is used two ways in the spec and the difference matters, so it is
named here once. Split by consequence rather than by table:

| Action                                             | Who                                                 |
| -------------------------------------------------- | --------------------------------------------------- |
| Delete, change visibility, change the capture date | **The item's** uploader, or an admin                |
| Tags, people, alt text                             | **Any** uploader or admin, on anything they can see |

The first group is destructive or changes who can see something, so it belongs
to whoever put it there. The second is additive and cheap to correct, and is
better for being collective: whoever recognises the face should be able to say
so. A `viewer` may do none of it, which is the one genuine role check on an
item and therefore the one genuine 403.

## The request context

The middleware attaches this before any handler runs. Assume it exists; do not
design it.

```ts
type Viewer = {
  memberId: string;
  sessionId: string;
  role: "viewer" | "uploader" | "admin";
  isAdmin: boolean;
  /** Cached per (memberId, visibilityGeneration). */
  visibleRuleIds: readonly string[];
};
```

## Forbidden in any payload

- Any field that distinguishes an empty archive from an archive the viewer
  cannot see. No `hiddenCount`, no `archiveIsEmpty`, no debug field. The two
  must be byte-identical on the wire.
- Any count that visibility can filter, served from a stored column. All are
  per-viewer aggregates (`data-models.md` § One rule that outranks the others).
- `memberId` on anything in the people directory
  (`data-models.md` § `tags`, `item_tags`, `people`, `item_people`).
- A raw storage key. Signed URLs with `expiresAt`, minted at render.
- An IP address, a location, or a raw user-agent beyond the parsed
  `deviceLabel`.
- A formatted or relative date string.

## Citing

Cite the schema, never restate it: `(data-models.md § items)`, `(Decision 7)`.
If a fact you need is not in the data model, say so in "Open questions" rather
than inventing it.

## Per-route template

Used for every single route, without exception.

```markdown
#### `METHOD /api/path`

**Surface** 2 `timeline`, states `pile`, `filtered`
**Auth** session required | anonymous · **Role** viewer | uploader | admin | self | self-or-admin | uploader-of-item-or-admin
**Request** `type XRequest = { … }` (path, query and body, each labelled)
**Response** `200` `type XResponse = { … }`
**Errors** | status | code | when |
**Transformations** what the server computes that the schema does not imply
**Performance** index used · N+1 risk · what must be one query rather than a loop
```

## Document structure

1. `# <Slice name>`, and a one-paragraph scope statement naming what is **not**
   here.
2. A route table: method, path, auth, role, one-line purpose.
3. One section per route, using the template above, grouped by resource.
4. `## Shared types in this slice`, for DTOs only your slice uses.
5. `## Additions requested to the frozen DTOs` (may be empty).
6. `## Open questions for the coordinator` (may be empty). Once the
   coordinator has answered them, the section is rewritten in place as
   `## Rulings`, keeping the numbering, so a later reader finds the decision
   and its reasoning where the question was rather than in a changelog. All
   eight slices are now at that stage.

No introduction, no conclusion, no summary of the data model. Never use an em
dash for rhetorical effect; use commas, colons, semicolons or parentheses.

---

# What no slice owns

Everything below is settled here and may not be redefined by a slice.

## The auth middleware

- **The session cookie** is `shoebox_session`: `HttpOnly`, `Secure`,
  `SameSite=Lax`, `Path=/`. One origin serves both the app and the API
  (`docs/architecture.md`), so no CORS and no cross-site cookie.
- **Looked up in the database on every request.** Both My account and Members
  promise a signed-out device "stops working immediately, wherever it is". That
  rules out a stateless JWT and any cache without an invalidation channel. An
  auth library will quietly violate this.
- **The slide is throttled**: `sessions.last_used_at` and `expires_at` are
  written only when the remaining lifetime has moved by more than a day, which
  caps it at roughly one write per session per day. `members.last_seen_at` is
  throttled the same way. Without this, a timeline page of thumbnails is dozens
  of writes serialising on SQLite's single writer.
- **`visibilityGeneration`** is an integer in the settings table, bumped by any
  change to group membership, to a visibility rule's subjects, or to a member's
  role. `visibleRuleIds` is cached per `(memberId, visibilityGeneration)`, so a
  group edit invalidates every viewer's cache at once and nobody keeps stale
  access.
- A route marked `Auth: anonymous` is reachable without a session. Only the
  sign-in routes, `GET /api/health`, and the anonymous read of the Shoebox name
  the sign-in page needs are.
- **`DELETE /api/auth/session` is exempt from the 401.** Signing out is
  idempotent: a dead, expired or absent cookie returns `204`, because a person
  pressing "sign out" and being told they are not signed in has been failed by
  the software rather than informed by it.

## Rate limits

Applied by the middleware, not by handlers. `429` with
`details.retryAfterSeconds`.

| Scope                                                           | Limit                                                                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `POST /api/auth/sign-in-codes` and `/resend`, per address       | 5 per hour, **shared**. Resend draws on the same bucket or it is a way round the cap                |
| `POST /api/auth/sign-in-codes`, per IP                          | 20 per hour                                                                                         |
| `POST /api/auth/session`, per address                           | 10 per hour, on top of the per-code attempt cap                                                     |
| `POST /api/members/:memberId/invitation/resend`, per invitation | 1 per minute and 10 per day. The middleware reads `invitations.last_sent_at`, which exists for this |
| Comment and reaction writes, per member                         | 60 per minute                                                                                       |
| Every upload-session route, per session                         | 3,000 per minute, in place of the row below: a large batch makes about four calls a file (step 6a)  |
| Everything else authenticated                                   | 600 per minute per session                                                                          |

The per-IP limit is the one place an IP is touched, in memory, never stored and
never logged (`data-models.md` § Privacy).

## The job runner

Seven background jobs. None is an HTTP route and none belongs to a slice. They
are named here so a slice can cite one. (This said "four" while listing six,
which was a merge artefact: two were added to close holes the slices found, and
`visibility-rule-sweep` is the seventh.)

| Job                     | Cadence | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `session-sweep`         | hourly  | Deletes `sessions` rows past `expires_at`. Housekeeping, not security: sessions are looked up per request, so an expired row is already dead.                                                                                                                                                                                                                                                                                                          |
| `invitation-lapse`      | hourly  | Flips any `invited` member whose latest invitation is past `expires_at` and unrevoked to `status = 'removed'`. Without it a lapsed invitation stays signable forever, because no token ever gated it.                                                                                                                                                                                                                                                  |
| `sign-in-code-sweep`    | hourly  | Deletes expired and consumed `sign_in_codes` rows.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `upload-abandon-sweep`  | 15 min  | Two jobs in one, because both are "this batch is not coming back". Marks non-terminal `upload_files` `failed` with `problem_code = 'abandoned'` past a grace period, then runs the settle latch. **The single most important piece of upload plumbing the mockup does not show.** Also cancels **pre-commit drafts** idle longer than `appConfig.upload.draftExpiryHours`, which the latch cannot reach because it requires `committed_at IS NOT NULL` |
| `removal-reminder`      | hourly  | `INSERT ... ON CONFLICT DO NOTHING` on `outbound_emails` with `week_index = floor((now - created_at) / 7 days)`, which makes two reminders in one week arithmetically impossible. No scheduler state.                                                                                                                                                                                                                                                  |
| `object-deletion-drain` | 5 min   | Drains `pending_object_deletions` into Backblaze deletes, retrying on failure.                                                                                                                                                                                                                                                                                                                                                                         |
| `visibility-rule-sweep` | daily   | Deletes `visibility_rules` rows no item references. `POST /api/visibility-rules/resolve` mints rules for an upload that may then be abandoned, so orphans accumulate; `data-models.md` § Deleting an item calls for this sweeper and nothing declared it.                                                                                                                                                                                              |

## `SETTING_DEFINITIONS`

Lives in `packages/shared`. One entry per key, giving its Zod schema, its
default, and the scopes it permits. Both halves of the app read the same object,
which is what lets a fresh instance hold **zero** settings rows and still render
correctly.

```ts
type SettingDefinition<T> = {
  key: string;
  schema: ZodType<T>;
  default: T;
  scopes: readonly ("instance" | "member")[];
  /**
   * Served by the anonymous `GET /api/public-settings`. True today for
   * `shoebox.name` and `public.base_url` only, because surface 1 renders the
   * Shoebox name before anybody is signed in.
   */
  isPubliclyReadable: boolean;
};
```

Keys today: `shoebox.name`, `pile.arrangement`, `shoebox.timezone`,
`mail.from_address`, `mail.from_name`, `mail.domain_verified_at`,
`mail.domain_last_check_error`, `public.base_url`, `visibility.generation`.

The scope restriction is load-bearing: it is what stops `pile.arrangement`
quietly becoming a personal preference later. `isPubliclyReadable` is
load-bearing in the same way and in the other direction: a key is readable
without a session because it carries that flag, never because a route forgot
to check, which is the difference between a rule and a habit.

## Error code registry

The master list. Slices append; the coordinator namespaces on merge. On a
collision the more specific code wins and the general one is renamed.

| Code                              | Status |
| --------------------------------- | ------ |
| `invalid_request`                 | 400    |
| `not_signed_in`                   | 401    |
| `rate_limited`                    | 429    |
| `sign_in_code_expired`            | 410    |
| `sign_in_code_invalid`            | 401    |
| `sign_in_code_attempts_exhausted` | 410    |
| `upload_storage_unavailable`      | 503    |
