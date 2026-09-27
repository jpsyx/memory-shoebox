# Step 1: The schema and the shared contract

**Status:** not started
**Parallel with:** nothing: this step is sequential
**Depends on:** nothing

## What this step delivers

Every table in the specified schema, as migrations that build an empty
database from nothing, plus the part of the HTTP contract that more than one
slice needs: the frozen DTOs, the shared enums and `SETTING_DEFINITIONS` in
`packages/shared`. No routes, no handlers, no interface.

This is the step everything else imports. It is deliberately boring, and it is
the one where a wrong cascade costs six later steps.

**Done when:** `pnpm migrate` builds the whole schema from an empty file and is
idempotent on a second run; `pnpm check` is green; and a test asserts that every
foreign key, cascade and `CHECK` named in the data model exists, by querying
the database rather than by reading the migration source.

## How to execute this step

You are implementing **only this step**. Other steps are listed at the foot of
this file; they are not yours and several are deliberately not designed yet.

**Two different documents are called a spec here, so they are named apart
throughout.** The **product spec** is `docs/PRODUCT.md` and
`docs/prds/2026-09-27-memory-shoebox/design-spec.md`: they already exist, they
cover the whole product, and you only read them. Your **step design** is what
you write for this step alone, under `docs/superpowers/specs/`. Where an
instruction below says one, it never means the other.

Run the full superpowers cycle, scoped to this step:

1. **`superpowers:brainstorming`.** Read the documents under "Read these first"
   before asking anything. They were written to answer the questions this step
   raises, and most of your questions are already answered there, including
   about forty-nine that were asked and ruled on explicitly. Ask the user only
   what those documents genuinely do not settle **and** that this step needs
   now. Treat this as architectural scope: it produces a written spec.
2. **Write the step design** at
   `docs/superpowers/specs/YYYY-MM-DD-schema-and-contract-design.md`. Base it on
   the product spec and `tech-specs/` rather than restating them: cite the
   sections, and write down only what is specific to this step, which here is
   mostly migration ordering and the Kysely type strategy.
3. **`superpowers:writing-plans`** for the detailed implementation plan.
4. **`superpowers:subagent-driven-development`** (or
   `superpowers:executing-plans`) to implement it.

## Read these first

| Document                                                             | What you need from it                                                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/data-models.md`      | **Everything.** Every table, column, key, cascade, index, and the seventeen decisions. This is the step's whole specification  |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md` | § The frozen DTOs, § Types, § String lengths, § `SETTING_DEFINITIONS`. Binding on every route later, and half of it ships here |
| `docs/PRODUCT.md`                                                    | § How it works, for why the shape is what it is. § Non-goals, so you do not build for a future that is not coming              |
| `docs/shared.md`                                                     | What belongs in `packages/shared` and the runtime-import constraint that makes the server import types only                    |
| `docs/rules/sql.md`, `docs/rules/typescript.md`                      | Binding house style. The 4-property rule and the naming conventions apply to everything you write                              |
| `docs/server.md`, `docs/architecture.md`                             | Where the database lives, how Kysely and better-sqlite3 are wired, and why media never passes through the server               |
| `app.config.ts`                                                      | The product knobs. This step wires them so `apps/server` can import them; it does not use them                                 |

## Scope

**In:**

- Migrations for every table in `data-models.md`, in dependency order, each
  reversible, applied by `pnpm migrate`
- Every foreign key with the exact cascade the model names, including the three
  that are deliberately not cascades: `removal_requests.item_id` is `SET NULL`
  so takedown history survives the takedown, `activity_events.subject_id` has
  **no** foreign key so the log can hold a dangling id, and `bursts` is dropped
  by application code because no foreign key direction does it
- Every index the model declares, including the ones the question walk added:
  `upload_sessions (uploaded_by, state)`,
  `item_views (member_id) WHERE first_opened_at IS NOT NULL`,
  `outbound_emails (state, next_attempt_at)` and `(state, created_at)`
- Every `CHECK` the model names, in particular
  `items.capture_source IN ('exif','video_metadata','filename','file_mtime','uploader_set','upload_time')`
  with **no** `'manual'` member, and
  `item_capture_date_changes.reason IN ('milestone_reconcile','manual','timezone_change')`
  which does have one. The two columns mean different things; see
  `data-models.md` Decision 10
- Kysely database types generated from or checked against the migrations, so a
  column rename cannot pass type-check
- `packages/shared`: the frozen DTOs from `conventions.md` § The frozen DTOs
  (`MediaSource`, `MediaRef`, `ItemSummary`, `BurstSummary`, `CommentDto`,
  `MemberRef`, `PersonRef`, `MilestoneRef`, `VisibilitySummary`,
  `ReactionKind`), each as a Zod schema and its inferred type
- `packages/shared`: `SETTING_DEFINITIONS`, one entry per key, each with its
  Zod schema, default, permitted scopes and `isPubliclyReadable`
- `packages/shared`: the string length caps from `conventions.md` § String
  lengths, as shared constants, so three slices cannot pick three numbers
- The error envelope type (`error`, `message`, `details`) extending the
  `apiErrorSchema` already in `packages/shared`
- `app.config.ts` importable from `apps/server` with a relative `.ts` import

**Out, and owned by a later step:**

- Any HTTP route at all (steps 3a onward)
- Middleware, the job runner, the B2 client, the mail queue's worker (step 2)
- Per-route request and response schemas. Each backend step adds its own slice's
  to `packages/shared`; only the shared shapes are yours
- **Demo** data of any kind. There is no demo dataset and none is to be
  invented (`PRODUCT.md` § Evidence on Hand): no members, no items, no
  fixtures, nothing that represents a family.

  This does **not** exclude the structural rows the schema's own design
  requires. `data-models.md` § What that costs asks for one
  `visibility_rules` row with `mode = 'everyone'` and a constant id, seeded at
  migration time, and two API slices depend on that id existing before any
  request is served. That row is part of the schema, not a fixture, and it is
  seeded in migration 0002.

## Interfaces this step produces

- `pnpm migrate`, applying every migration, idempotent
- The Kysely `Database` interface, exported from `apps/server`
- `@memory-shoebox/shared`: every frozen DTO schema and type,
  `SETTING_DEFINITIONS`, the length caps, the error envelope
- `appConfig` from `app.config.ts`

## Interfaces this step consumes

Nothing.

## Do not ask the user about

These are later steps. If a question about one comes up, note it and move on:

| Topic                                                  | Owned by                          |
| ------------------------------------------------------ | --------------------------------- |
| Sign-in, sessions, devices, the visibility predicate   | step 3a                           |
| The web app's router, theme or components              | step 3b                           |
| The timeline query and its cursor                      | step 4a                           |
| Comments, reactions, tags, people, item visibility     | step 5a                           |
| Uploads, presigning, derivatives, the settle latch     | step 6a                           |
| Milestones and removal requests                        | step 7a                           |
| Members, invitations, groups, settings, the change log | step 8a                           |
| Email copy and rendering                               | step 2, and each slice's own step |

## Verification

- `pnpm migrate` against a deleted database file, twice, with no error the
  second time
- `pnpm check` green
- A test that opens the migrated database and asserts, from
  `PRAGMA foreign_key_list` and `PRAGMA index_list`, that every relationship and
  index in `data-models.md` is present with the cascade the model names. Reading
  this from the live database rather than from the migration files is the point:
  a migration that silently did not apply looks identical to one that did
- A test that `SETTING_DEFINITIONS` covers every key named in
  `conventions.md` § `SETTING_DEFINITIONS`, and that a fresh instance with zero
  settings rows resolves every one of them to its default
