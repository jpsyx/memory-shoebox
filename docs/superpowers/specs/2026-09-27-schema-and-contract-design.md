# Step 1: the schema and the shared contract

**Step design** for step 1 of
[`docs/prds/2026-09-27-memory-shoebox/plan/step-1.md`](../../prds/2026-09-27-memory-shoebox/plan/step-1.md).

This is not the product spec. The product spec is
[`docs/PRODUCT.md`](../../PRODUCT.md) and
[`design-spec.md`](../../prds/2026-09-27-memory-shoebox/design-spec.md), and
the schema this implements is
[`data-models.md`](../../prds/2026-09-27-memory-shoebox/tech-specs/data-models.md).
This document records only what is specific to building them, and cites rather
than restates.

## What this delivers

Thirty-three tables as migrations that build an empty database from nothing,
the Kysely types over them, and the part of the HTTP contract that more than
one slice needs. No routes, no handlers, no interface.

**Counting the tables is harder than it should be, and getting it wrong is the
first way this step fails.** Twenty-nine have their own `###` heading in
`data-models.md`. Four do not, and a reader working from the headings misses
them:

| Table                      | Where it is defined                                                          |
| -------------------------- | ---------------------------------------------------------------------------- |
| `visibility_rules`         | Under `## Visibility tables`, in prose, with no heading of its own           |
| `visibility_rule_subjects` | The same paragraph                                                           |
| `email_delivery_events`    | One sentence inside `### outbound_emails`, introduced as a "companion table" |
| `email_suppressions`       | The same sentence                                                            |

Four further names in the document look like tables and are not built:

| Name                                                       | Why not                                                                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `member_active_days`                                       | Its own section is headed "(deferred)": at nine members the figures compute live               |
| `day_rule_counts`, `tag_rule_counts`, `person_rule_counts` | A contingency if the read path stops being fast. The document says "**Do not build them yet**" |
| `mail_status`                                              | The document says there is no such table; the banner is a query over `outbound_emails`         |

## What already exists, and what it settles

The migration machinery is finished and tested. It is worth reading before
writing anything, because it removes a set of decisions:

| File                                          | What it already settles                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `apps/server/src/db/client.ts`                | WAL, and **`PRAGMA foreign_keys = ON`**, so every `ON DELETE` below is enforced behaviour rather than documentation |
| `apps/server/src/db/migrate.ts`               | `migrateToLatest`, taking a handle so tests run in memory. Idempotency comes from Kysely's `Migrator`               |
| `apps/server/src/db/migrations/migrations.ts` | Explicit registry, `NNNN_description.ts` beside it, lexicographic order, never edit a shipped migration             |
| `apps/server/src/db/types.ts`                 | `Database` is `Record<never, never>` and its docstring commits to one hand-written entry per table                  |
| `packages/shared/src/index.ts`                | `healthResponseSchema` and `apiErrorSchema`, the pattern every DTO follows                                          |

## Decisions

### 1. Seven migrations, grouped as the data model is

One migration per section of `data-models.md`, in an order that also satisfies
the foreign keys:

| Migration                     | Tables                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0001_identity_and_access`    | `members`, `sign_in_codes`, `sessions`, `invitations`, `groups`, `group_members`                                                                 |
| `0002_visibility`             | `visibility_rules`, `visibility_rule_subjects`                                                                                                   |
| `0003_archive`                | `items`, `item_renditions`, `bursts`, `milestones`, `item_milestones`, `item_capture_date_changes`, `tags`, `item_tags`, `people`, `item_people` |
| `0004_comments_and_reactions` | `comments`, `item_reactions`, `comment_reactions`                                                                                                |
| `0005_moderation`             | `removal_requests`                                                                                                                               |
| `0006_upload`                 | `upload_sessions`, `upload_files`, `upload_batch_edits`, `upload_batch_edit_targets`, `pending_object_deletions`                                 |
| `0007_operations_and_audit`   | `settings`, `outbound_emails`, `email_delivery_events`, `email_suppressions`, `item_views`, `activity_events`                                    |

**Why seven and not one.** Nothing has shipped, so a single
`0001_initial_schema` would be honest and is the cheaper thing to write. It is
the more expensive thing to _review_: thirty-three tables in one file gives a
reader no seam to stop at, and this is the step where a wrong cascade costs six
later ones. Seven files let a reviewer check one migration against one section
of the document it came from, and a failure names the group it died in.

**Why not one per table.** Thirty-three files whose ordering is load-bearing and
hand-maintained, to buy granularity that is never exercised, because they all
ship together and always will.

### 2. UUIDv7 comes from the `uuidv7` package

`data-models.md` § Conventions specifies UUIDv7 primary keys and the reasoning
is load-bearing rather than decorative: ids sort by creation, give index
locality on insert, and serve as pagination cursors **without a second
column**. The timeline cursor, the activity cursor and the upload file cursor
all rely on it.

Nothing in the repository can produce one. `crypto.randomUUID()` is v4, which
is random, and adopting it would break all three properties and force a
respecification of three routes.

Add `uuidv7` to `apps/server`. It is small, has no transitive dependencies, and
implements RFC 9562 including the **monotonic counter for ids minted inside the
same millisecond**. That last part is the reason to prefer it over twenty-five
hand-written lines: the same-millisecond case is where a hand-rolled version
usually goes subtly wrong, and the symptom is a cursor that occasionally skips
a row under a burst of inserts, which is both rare and silent.

### 3. Hand-written Kysely types, with a drift test

`types.ts` stays hand-written, as its own docstring intends: it is reviewed
prose that says what the schema is, and a generated file is neither read nor
reviewed.

Hand-written types can drift from the migrations, and drift is exactly what
Kysely exists to prevent, so a test closes it. `apps/server/test/schema.test.ts`
migrates an in-memory database and compares the **live** database against the
`Database` type: every declared table exists, every column matches in name and
nullability, and no table exists that `Database` does not declare. A rename
that misses `types.ts` becomes a failing test rather than a type that
type-checks green and fails in production.

Rejected: `kysely-codegen`. It cannot drift, and it costs a dev dependency, a
regeneration step somebody will forget, a large generated file in every schema
review, and generated docstrings the repository's comment rules would not
otherwise permit.

## `SETTING_DEFINITIONS` lives in `packages/shared`, and this was tested

Two documents disagreed, and the disagreement mattered because
`SETTING_DEFINITIONS` holds Zod schemas the server needs **at runtime** to
resolve defaults:

- `apis/conventions.md` § `SETTING_DEFINITIONS`: "Lives in `packages/shared`.
  Both halves of the app read the same object."
- `docs/shared.md`: "from the server, import only types from
  `@memory-shoebox/shared`", and if a runtime value is ever needed, "verify it
  actually loads under `pnpm start` before relying on it, and record the result
  here."

**Verified: it loads.** A server-context module importing a runtime Zod value
from `@memory-shoebox/shared` and calling it executes cleanly under Node's type
stripping. `conventions.md` therefore wins, and `SETTING_DEFINITIONS` goes in
shared.

**`docs/shared.md` is updated to record that result**, which is what that file
asks of whoever tests it. Recording it is part of this step, not a follow-up.

**The caveat, written down rather than papered over.** The probe ran in the
development workspace, not inside the production container. The Dockerfile's
final stage copies `/app` wholesale specifically so pnpm's relative symlinks
stay valid, and `zod` is a runtime dependency of `packages/shared` rather than
a dev one, so the production shape should behave identically. "Should" is not
"does", and the mitigation is a startup smoke test in a later step rather than
an assertion here.

## Structure

```
apps/server/src/db/
  migrations/
    0001_identity_and_access.ts
    0002_visibility.ts
    0003_archive.ts
    0004_comments_and_reactions.ts
    0005_moderation.ts
    0006_upload.ts
    0007_operations_and_audit.ts
    migrations.ts                 registry, gains seven entries
  types.ts                        hand-written, one entry per table

apps/server/test/
  schema.test.ts                  NEW

packages/shared/src/
  index.ts        re-exports only
  health.ts       the existing health schemas, moved
  errors.ts       apiErrorSchema extended with details
  limits.ts       string caps and per-item limits
  settings.ts     SETTING_DEFINITIONS
  dtos.ts         the frozen DTOs
```

**`index.ts` becomes re-exports only.** It is 35 lines today and would reach
several hundred with the DTOs, the settings and the caps in it. The repository's
own rule is to extract when a file grows past what can be held in context, and
a barrel keeps the import path `@memory-shoebox/shared` unchanged for both
consumers.

**The frozen DTOs stay in one file.** All twelve of them, and they are
mutually referential: `MediaRef` composes `MediaSource`, `ItemSummary` composes
`MediaRef`, `BurstSummary` and `VisibilitySummary`. Splitting them across a
dozen files buys nothing and costs a web of imports. `conventions.md` § The
frozen DTOs defines them as one block and this mirrors it. Copy the list from
there rather than from memory: two of the twelve, `TagRef` and
`ReactionSummary`, are easy to overlook.

### What goes in each shared module

| Module        | Contents                                                                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `errors.ts`   | `apiErrorSchema` extended with `details`, carrying its three documented uses: `fieldErrors`, `retryAfterSeconds`, `attemptsRemaining`                                                                                           |
| `limits.ts`   | The caps from `conventions.md` § String lengths, as named constants so three slices cannot pick three numbers                                                                                                                   |
| `settings.ts` | `SETTING_DEFINITIONS`, one entry per key with its Zod schema, default, permitted scopes and `isPubliclyReadable`                                                                                                                |
| `dtos.ts`     | All twelve, in `conventions.md`'s own order: `ReactionKind`, `MediaSource`, `MediaRef`, `MemberRef`, `PersonRef`, `TagRef`, `MilestoneRef`, `VisibilitySummary`, `BurstSummary`, `ItemSummary`, `ReactionSummary`, `CommentDto` |

Each is a Zod schema plus the type inferred from it, following the
`healthResponseSchema` / `HealthResponse` pattern already in the package.

## Implementation notes

**Circular and forward foreign keys are expected and are not a problem.**
SQLite resolves a foreign key's target lazily, at DML time rather than DDL
time, so a table may reference one that does not exist yet. Three cases occur
here and an implementer should not reorder the migrations to avoid them:

- `items.burst_id` → `bursts` and `bursts.cover_item_id` → `items`, a genuine
  cycle inside `0003_archive`
- `items.upload_session_id` → `upload_sessions`, which `0006_upload` creates
- `bursts.upload_session_id` → `upload_sessions`, likewise

All three resolve before any row is written, which is all `PRAGMA
foreign_keys = ON` requires.

**Three relationships are deliberately not what a reader will expect**, and each
has its reason in the document. They must survive review:

- `removal_requests.item_id` is `SET NULL`, so takedown history outlives the
  takedown
- `activity_events.subject_id` has **no foreign key at all**, so the log can
  hold the dangling id of a deleted item
- `bursts` is dropped by application code when its last frame goes, because no
  foreign key direction expresses it

**Two `CHECK` constraints look like each other and are not.**
`items.capture_source` has **no** `'manual'` member; the permitted set is
`('exif','video_metadata','filename','file_mtime','uploader_set','upload_time')`.
`item_capture_date_changes.reason` **does**, and its set is
`('milestone_reconcile','manual','timezone_change')`. One records how a date
was arrived at, the other why it was changed. `data-models.md` Decision 10
spells this out; two API slices misread it before it was settled.

**Four tables are described in prose rather than under a heading**, and the
table at the head of this document lists them. Build from that list, not from
the document's headings.

**No stored count that visibility can filter.** `data-models.md` § One rule
that outranks the others. Nothing in this step is tempted by it, and the step
after this one will be, so the drift test's column assertion is also the guard
against a `frame_count` or `item_count` column appearing later.

## Testing

Red/green TDD per `AGENTS.md`. Four tests carry the step, and three of them
read the **live** database rather than the migration source, because a
migration that silently did not apply looks identical in source to one that
did.

| Test              | Asserts                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema drift      | Every table and column in `Database` exists in the migrated database with matching nullability, and no table exists that `Database` omits                |
| Relationships     | Every foreign key carries the exact `ON DELETE` the model names, read from `PRAGMA foreign_key_list`, plus every declared index from `PRAGMA index_list` |
| Idempotency       | `migrateToLatest` twice against one database: the second call applies nothing and errors on nothing                                                      |
| Settings defaults | A database with zero `settings` rows resolves every key in `SETTING_DEFINITIONS` to its default, which is what lets a fresh instance render              |

A `CHECK` constraint test is worth adding for the two lookalike enums above,
because getting them the wrong way round type-checks green and is caught by
nothing else.

## Documentation this step updates

`AGENTS.md` makes keeping `docs/` current part of the definition of done.

| File             | Change                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `docs/shared.md` | Record that a runtime import from the shared package loads under Node's type stripping, with the caveat above               |
| `docs/server.md` | The database section: the seven migrations and what each group holds                                                        |
| `data-models.md` | "Nothing here is built" is no longer true. Its `#open-questions` link points at a section that was renamed and is now empty |

## Out of scope

- Every HTTP route (steps 3a onward)
- Middleware, the job runner, the B2 client, the mail queue (step 2)
- Per-route request and response schemas. Each backend step adds its own
  slice's; only the shared shapes are here
- `member_active_days`, deferred by the data model itself
- Seed data of any kind. There is no demo dataset and none is to be invented
  (`PRODUCT.md` § Evidence on Hand)

## Done when

`pnpm migrate` builds the whole schema from an empty file and is idempotent on
a second run; `pnpm check` is green; and the four tests above pass against a
database built by the migrations rather than by a fixture.
