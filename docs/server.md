# The API server (`apps/server`)

A Fastify 5 process that owns the SQLite catalog, talks to Backblaze B2, and
serves the built web app. Node executes its TypeScript directly, so there is no
build step and the production container runs the same files you edit.

## Layout

```
apps/server/
├── src/
│   ├── index.ts            entry point: config, database, listen, shutdown
│   ├── app.ts              builds the Fastify instance (createApp)
│   ├── config.ts           environment parsing and validation
│   ├── db/
│   │   ├── client.ts       opens SQLite, returns a typed Kysely handle
│   │   ├── types/          the schema as Kysely sees it, by table group
│   │   ├── migrate.ts      migration runner, also a CLI
│   │   └── migrations/     one file per migration, registered explicitly
│   ├── http/
│   │   ├── requestContextHelpers.ts  the viewer, and requireViewer
│   │   ├── ApiError.ts        one constructor per refusal
│   │   ├── registerErrorHandler.ts  the error envelope every failure wears
│   │   └── rateLimit/         the rule table, the counters, and the hook
│   ├── jobs/
│   │   ├── createJobRunner.ts    intervals, overlap guard, clean stop
│   │   ├── createJobRegistry.ts  the seven jobs, with their cadences
│   │   └── run*.ts         one module per job
│   ├── mail/               the outbound queue: see mail.md
│   ├── settings/           instance settings, read through their defaults
│   ├── time/               calendar days in the Shoebox's own timezone
│   ├── visibility/         the seeded `everyone` rule's id
│   ├── b2/client.ts        Backblaze B2 over the S3-compatible API
│   ├── routes/             one module per route group, mounted under /api
│   └── web/staticSpa.ts    serves the built SPA and the SPA fallback
├── test/                   Vitest suites
└── .env.example            template for local configuration
```

## Startup

`src/index.ts` does four things in order: read configuration, open the
database, apply pending migrations, then build and start the app. Migrations
run at boot deliberately, so a self-hoster upgrading their instance never has
to remember a separate step.

It also handles `SIGTERM` and `SIGINT` by closing the server and the database
before exiting. Fly.io stops machines with `SIGTERM`, and SQLite wants a clean
close so its write-ahead log checkpoints properly.

## The application factory

`createApp(deps)` in `src/app.ts` builds the Fastify instance and returns it.
It reads no environment variables and opens no connections: the caller passes
in the config, the database, and optionally a Backblaze client. That is what
lets tests run the real application against an in-memory database and a fake
B2, using `app.inject()` instead of a socket.

Dependencies are attached to the instance with `app.decorate`, so any handler
can reach them as `request.server.database` or `request.server.b2` without
importing module-level state.

## Routes

Route modules live in `src/routes/` and are registered under the `/api` prefix,
so a module declaring `GET /health` is reachable at `/api/health`. Group them
by resource, one module per group.

Today there is exactly one: `routes/health.ts`, serving `GET /api/health`. It
is unauthenticated, reports the server version and uptime, and is what Fly.io's
health check calls. It deliberately reveals nothing else.

**One route, but not one route's worth of machinery.** A new module registered
here already gets `request.viewer`, the rate limits its route config names, and
the single error envelope, from the sections below; it can enqueue mail
inside its own transaction, and the seven background jobs its tables rely on
are already running. What a route slice still has to build is its own handlers,
and for the authentication slice the session lookup behind the viewer.

The contract's 78 routes are specified but not built, and `GET /api/health` is
not one of them. [`docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/`](prds/2026-09-27-memory-shoebox/tech-specs/apis) carries the whole
contract: one document per route group, matching the module-per-resource layout
above, plus [`conventions.md`](prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md), which is binding on all of
them. Read that file before adding any route, because the things most easily
got wrong are settled there rather than per route: 404 never 403 for anything
the viewer may not see, every count filtered per viewer, and the visibility
predicate computed once by the middleware.

## Serving the web app

`src/web/staticSpa.ts` registers `@fastify/static` over the built web app and
installs the not-found handler:

- A request under `/api/` that matches no route gets a JSON 404.
- Anything else falls back to `index.html`, so a hard refresh on a client-side
  route works.

When the build output does not exist the static handler is skipped entirely and
everything returns a JSON 404. That is the normal case in development, where
Vite serves the app and proxies `/api` here, and in tests.

See [architecture.md](architecture.md#one-origin-one-deployment) for why the
server serves the SPA at all.

## Configuration

`src/config.ts` parses the environment with Zod and returns a validated
`Config`. Two details matter:

- It takes the environment as an argument rather than reading `process.env`, so
  tests can exercise it directly. `getConfig()` is the process-wide accessor
  that reads `process.env` once and caches.
- A failure reports **every** offending variable at once. Someone setting up an
  instance for the first time should not discover their mistakes one restart at
  a time.

Every variable is listed in [configuration.md](configuration.md).

## The request context

`src/http/requestContextHelpers.ts` decorates every request with `viewer`:
either undefined or a `Viewer` carrying the member, the session, the role and
the ids of the visibility rules that member may see through. An `onRequest`
hook fills it in, which is early enough that the rate limiter can read it, and
`requireViewer(request)` is what a handler calls to get a viewer or a
`401 not_signed_in`.

`Viewer`'s shape is frozen by
[`conventions.md` § The request context](prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md),
which also says "assume it exists; do not design it". So this package ships the
seam and not the lookup: the authenticator is an injected `createApp`
dependency whose default returns undefined, and step 3a replaces it with the
session lookup, the throttled slide of `sessions.last_used_at` and the
`visibleRuleIds` cache. Everything that **reads** a viewer is finished, because
neither branch cares where it came from.

One route must never call `requireViewer`: `DELETE /api/auth/session`.
`conventions.md` exempts signing out because it is idempotent, and telling
somebody who pressed "sign out" that they are not signed in has failed them
rather than informed them.

## Errors

Every failing route answers in one envelope: a stable `snake_case` `error` code
the client branches on, an English `message` that is never the interface copy,
and an optional `details` carrying one of three documented structured cases.
`conventions.md` § Errors owns the status table and the code registry.
`src/http/ApiError.ts` carries that table as named constructors, so a handler
picks a refusal rather than a number.

The line those constructors exist to hold is the one most easily blurred:
**404 means you may not see it, 403 means you can see it and may not do it.**
A 404 for something that is hidden and a 404 for something that does not exist
are byte-identical on the wire, which is what stops a 403 confirming that
something exists at an id.

`src/http/registerErrorHandler.ts` translates whatever was thrown, in this order:

- An `ApiError` is already the answer and is used as it stands.
- **A `ZodError` becomes `400 invalid_request`**, its issues grouped by the
  field they came from into `details.fieldErrors`. A schema rejecting a request
  is the contract refusing it, not the server failing, and the client can put
  each message beside the input that earned it. Fastify's own JSON Schema
  validation errors are grouped into the same shape, so a handler validating
  either way answers identically.
- A framework 4xx the contract has no row for (a 405, a 413, a 415) collapses
  onto `400 invalid_request`, carrying the framework's own status in the
  `message` the caller receives, so a collapsed 413 stays diagnosable from the
  response itself rather than only from a log.
- **An unexpected error's own message never reaches the client.** Everything
  left over becomes `500 internal_error` with a fixed message, because a
  database error's text is a description of the schema.

It logs at `error` only for a 5xx. A 404 or a 429 is the contract working, and
a log line per rate-limited request is how a log becomes unreadable on the day
it matters.

## Rate limits

**Applied in the middleware, never in a handler**
(`conventions.md` § Rate limits). A route names the rules that apply to it in
its Fastify route config, and an authenticated route that names none gets
`authenticatedDefault`: 600 a minute per session.
`src/http/rateLimit/rateLimit.constants.ts` holds every row of that document
as a named rule, so the two tables can be checked against each other.

The hook is `preHandler` rather than `onRequest`, because two of the rules key
on the address in the request body and the body is not parsed until after
`onRequest`. It is still middleware: a handler neither knows about a limit nor
can forget one.

Counters are **fixed windows in memory**. Fixed rather than a token bucket,
because `details.retryAfterSeconds` is a number printed to somebody who is
waiting and a fixed window has an exact one. In memory rather than in SQLite,
because the deployment is one Fly machine and a counter row per request would
put write contention on the one part of the system with a single writer. The
cost is that a restart forgets every count, which is the right trade when the
longest window is an hour.

One rule is not a counter. `invitationResendPerInvitation` reads
`invitations.last_sent_at` and counts `outbound_emails` rows, because
`conventions.md` says it does and because a restart forgetting that an
invitation went out a moment ago would send a second one, which tells the
recipient something about our uptime rather than about the Shoebox.

**`request.ip` has to be the caller's, or the per-IP rule inverts.** `fly.toml`
puts Fly's proxy in front of the app, so `app.ts` sets `trustProxy` to exactly
one hop in production and to `false` everywhere else. Without it every request
carries the proxy's address and the twenty-an-hour sign-in limit stops being one
bucket per caller and becomes one bucket for the whole instance: twenty attempts
from anybody at all would lock the family out of their own archive. One hop
rather than `true`, because `true` believes an arbitrary `X-Forwarded-For` chain
from anywhere, and off in development because nothing fronts `pnpm dev:server`.

**The per-IP bucket is the only place in the product an address is touched.**
It is a `Map` key that dies with the process, it is never written to the
database, and it never reaches a log line: `app.ts` replaces Fastify's request
serializer for the same reason (`data-models.md` § Privacy).

## Background jobs

`src/jobs/createJobRunner.ts` is a plain interval scheduler owned by `createApp`, which
is enough for a single-machine deployment. `src/jobs/createJobRegistry.ts` builds the
seven jobs `conventions.md` § The job runner names, in that document's order so
the two read side by side. What each one does is there; this is the cadence it
runs at here:

| Job                     | Cadence |
| ----------------------- | ------- |
| `session-sweep`         | hourly  |
| `invitation-lapse`      | hourly  |
| `sign-in-code-sweep`    | hourly  |
| `upload-abandon-sweep`  | 15 min  |
| `removal-reminder`      | hourly  |
| `object-deletion-drain` | 5 min   |
| `visibility-rule-sweep` | daily   |

The mail queue runs on the same runner at ten seconds and is deliberately
**not** among them: the seven are a closed set a slice can cite, and a cadence
in seconds is not one of them. It shares the runner only because the runner
already owns what a polling loop needs. See [mail.md](mail.md).

Four properties every job relies on:

- **No overlap.** A run still going when the next tick arrives skips that tick.
  SQLite has one writer, and a slow sweep queueing behind itself is how a hung
  job becomes a hung database.
- **A failure is a log line, not a dead schedule.** Every job is idempotent, so
  the next tick simply tries again.
- **Nothing runs at `start()`.** The first run of each job is one interval
  later, which keeps boot fast and lets a test that advances a clock say
  exactly what it means.
- **It stops with the app.** `createApp`'s `onClose` hook stops the runner and
  waits for whatever is in flight, and `index.ts` closes the app on `SIGTERM`
  before it closes the database, so no sweep is left querying a handle that is
  closing underneath it.

Two jobs carry a named seam a later step fills, rather than a guess made early:

- `upload-abandon-sweep` marks abandoned files and cancels stale drafts, but
  the **settle latch** that decides a batch has finished is step 6a's, with the
  rest of the upload slice.
- `removal-reminder` selects what is due and computes each `week_index`, but
  the **enqueue call** is step 7a's, because the message needs copy and a
  payload type that would be a guess today.

## Database

SQLite through [Kysely](https://kysely.dev), with `better-sqlite3` underneath.

`createDatabase(path)` opens the file (creating its parent directory if
needed), enables write-ahead logging and foreign key enforcement, and returns a
`Kysely<Database>`. Pass `":memory:"` in tests.

`src/db/types/db.types.ts` declares the `Database` type: one property per
table, mapping a table name to its row shape. The row shapes themselves live
in one sibling file per table group, split the way the migrations are. Kysely type-checks every query against it, so it
has to be updated alongside each migration.
[tech-specs/data-models.md](prds/2026-09-27-memory-shoebox/tech-specs/data-models.md)
is the specification the migrations implement, and it is the place to look for
what a table's columns actually mean; this section only says where the schema
lives and how its pieces fit, not what it contains, because keeping the
columns in two documents is one document and one lie.

### Migrations

Migrations live in `src/db/migrations/` as `NNNN_description.ts`, each
exporting a `Migration`, and are registered by hand in
`src/db/migrations/migrations.ts`. They are registered rather than discovered
from disk on purpose: the server runs TypeScript directly, so a
filesystem-scanning provider would behave differently in development and
inside the production container, and `migrate.ts`'s `Migrator` would have no
stable way to enumerate them the same way twice.

There are nine. The first seven match the sections `data-models.md` is
grouped into; the last two are corrections, which is what the "never edit a
shipped migration" rule below turns a correction into:

| Migration                      | Holds                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `0001_identity_and_access`     | Members, sign-in codes, sessions, invitations, groups                                                         |
| `0002_visibility`              | Visibility rules and their subjects                                                                           |
| `0003_archive`                 | Items and everything hung off one: renditions, bursts, milestones, tags, people                               |
| `0004_comments_and_reactions`  | Comments and the two reaction tables                                                                          |
| `0005_moderation`              | Removal requests                                                                                              |
| `0006_upload`                  | Upload sessions, files, batch edits, pending object deletions                                                 |
| `0007_operations_and_audit`    | Settings, outbound email, item views, activity events                                                         |
| `0008_missing_child_indexes`   | Two indexes 0003 should have carried: `bursts.upload_session_id` and `item_capture_date_changes.milestone_id` |
| `0009_open_request_needs_item` | `CHECK (state <> 'open' OR item_id IS NOT NULL)` on `removal_requests`, added by rebuilding the table         |

Thirty-three tables in total. Column-level detail belongs in
[`data-models.md`](prds/2026-09-27-memory-shoebox/tech-specs/data-models.md),
not here.

Rules:

- Keep the zero-padded numeric prefix. Kysely orders migrations by key, and
  the registry in `migrations.ts` keys on the same string.
- **Never edit or reorder a migration that has already shipped.** Deployed
  databases have recorded it as applied and will not run it again, so a change
  to its body would silently diverge from what is actually on disk out there.
  A correction becomes a new migration.
- Update `src/db/types/` in the same change.

Run them with `pnpm migrate` locally. In production they run automatically at
startup.

**Where the `everyone` rule's id lives.** Migration 0002 seeds the `everyone`
visibility rule at a constant id, and that constant,
`EVERYONE_VISIBILITY_RULE_ID`, is declared in
`src/visibility/everyoneRule.ts`. The migration imports it from there, rather
than exporting it, so that runtime code never has to reach into a historical
migration file for a value. `visibility-rule-sweep` is the first runtime reader
of it: the sweep deletes unreferenced rules and must never delete this one,
however many items reference it, which on a fresh Shoebox is none. The value
itself never changed, so no database that has already applied 0002 diverges
from one that applies it now.

### `createId()`

`src/db/createId.ts` mints every primary key with `createId()`, which wraps
`uuidv7` package. UUIDv7 rather than v4 is load-bearing, not a style choice:
the first 48 bits are a Unix millisecond timestamp, so ids sort by creation
time, an insert lands at the end of a `PRIMARY KEY` index instead of
scattering across it, and three route cursors (the timeline, the activity
feed, the upload file list) page directly on the id with no second column to
break ties. `uuidv7` carries a sub-millisecond counter, which matters because
an upload commit can write several thousand rows inside one millisecond; a
plain timestamp-prefixed id with no counter would leave their order random
within that millisecond, and a cursor that relies on it would silently skip
rows.

### The schema oracle

`src/db/schemaIntrospectionHelpers.ts`, `schemaManifest.ts`, `schemaExpectations.ts`, and
`test/schema/` exist to keep this document, the `Database` type, and
the actual database from drifting apart.

`schemaIntrospectionHelpers.ts` reads the schema from a live database, not from migration
source: `sqlite_master`, `pragma_table_info`, `pragma_foreign_key_list`, and
`pragma_index_list`/`pragma_index_xinfo`. That is deliberate, and the reason is
specific: a migration that silently failed to apply, or was skipped, looks
identical in source to one that ran, but the two produce different databases.
Reading the source would assert that the migration file says what it says.
Reading the live database asserts that the file actually did what it says,
against a database each file under `test/schema/` builds by running
`migrateToLatest` for real.

`schemaManifest.ts` is the runtime counterpart of `src/db/types/`: every
table, every column, and three facts about each one, which are whether SQLite
enforces it as `NOT NULL`, the type it was declared with, and its `DEFAULT`
expression. Nullability is tied to the `Database` type by a mapped type, so
the two cannot disagree without a compile error; type and default ride
alongside, because a Kysely row type says nothing about either (`INTEGER` and
`REAL` are both `number`, and a default is invisible) and both are asserted
against the live database instead. All three are read rather than assumed for
the same reason: SQLite's affinity rules let `items.byte_size` change from
`INTEGER` to `TEXT` without a single query failing. It is a directory
module too, `schemaManifest/`, on the same table groups; each leaf
`satisfies Pick<SchemaManifestShape, ...>` so a wrong column still fails at
the column rather than as one error at the composition.

`schemaExpectations.ts` holds what the document promises for every foreign
key's delete rule (sixty-one of them, across twenty-eight tables), every index
a migration declared (sixty-three of those, with the columns each covers, the
direction each column sorts in, and whether it is unique), and the four
table-level `UNIQUE` constraints that are
written inside a `CREATE TABLE` and so never appear as an index at all
(`members.email`, `groups.name_normalized`, `tags.name_normalized`, and
`group_members (group_id, member_id)`). It is transcribed from
`data-models.md` rather than from the migrations, so that a migration
disagreeing with the document is what fails, not the other way around, and the
seven indexes the document does not list say in a comment which migration
added them and why. All three records are keyed by `keyof Database`, so a stale or
typo'd table name is a compile error rather than a silently dead entry.
It is a directory module, `schemaExpectations/`, holding one file per table
group split the way the migrations are, plus the shared `indexColumns`
helper. Its entry point composes the three records, and the
`Record<keyof Database, ...>` annotation there is what makes a dropped group
a compile error naming the tables it took with it.

`test/schema/` asserts all of it against the live database, in four files
split along what they assert: the migrated schema, every relationship, every
declared index, and the constraints. Each builds its own database, which costs
a few extra `migrateToLatest` runs and buys four files vitest can run in
parallel. It includes the check that a
partial index's `WHERE` predicate survived: several are load-bearing precisely
because they are partial, and a full index on the same columns would
type-check and silently change behavior. Column **direction** is asserted too,
which is why `readIndexes` reads `pragma_index_xinfo` rather than
`pragma_index_info`: only `xinfo` carries a `desc` flag, and eight of these
indexes are descending, `items_captured_on_rule_id` being the timeline's
primary sort. `schemaIntrospectionHelpers.ts` records the two limitations that remain, which
are expression indexes and the partial predicates `indexes.test.ts` reads
separately.

## Backblaze B2

`src/b2/client.ts` exposes a small client over B2's S3-compatible API:
`listObjects`, `presignGet`, `presignPut`, `presignMultipart` with the
`completeMultipart` and `abortMultipart` that make it usable, `deleteObject`,
and `putObject`. It is a factory returning an object rather than a class, and
it exposes only the operations Memory Shoebox needs, which keeps it easy to
fake in a test.

**Media bytes never pass through the server**
([architecture.md](architecture.md#where-data-lives)), which is what confines
this interface to signing URLs the browser uses and deleting objects the
browser cannot. `putObject` is the one exception, and exists for small derived
files.

`presignGet` signs for the seven-day S3 maximum by default and sets a matching
`Cache-Control`, so a browser that has already downloaded a photo does not
download it again. The tradeoff is spelled out in
[architecture.md](architecture.md#where-data-lives): a presigned URL is a
bearer link for as long as it lives. An upload URL gets an hour instead: a read
URL is a bearer link to bytes that already exist, and a write URL is permission
to put new bytes in somebody's bucket.

One setting is load-bearing rather than incidental. The client asks the SDK for
`requestChecksumCalculation: "WHEN_REQUIRED"`, because **a signed URL must not
assert a checksum for bytes the server never saw.** The default computes one at
signing time, when the only body in hand is the empty one, and bakes the CRC32
of nothing into every presigned PUT and every multipart part URL.

## Tests

Vitest, in `apps/server/test/`. The pattern is to build the real app through
`createApp` with an in-memory database and drive it with `app.inject()`. No
network, no fixture files, no test database to clean up.

```sh
pnpm --filter @memory-shoebox/server test
```

## Conventions specific to this package

- **Relative imports must include the `.ts` extension.** Node's type stripping
  resolves them literally. oxlint enforces this for `apps/server/**` and for
  `packages/shared/**`, and enforces the opposite everywhere else. The shared
  package is on that list because the server loads its TypeScript source at
  runtime, which is the same reason and not an exception to it.
- **Only import types from `@memory-shoebox/shared`** unless you have checked that the
  runtime import works under type stripping. See [shared.md](shared.md).
- Everything else follows the repository-wide rules in
  [`AGENTS.md`](../AGENTS.md) and [rules/typescript.md](rules/typescript.md).
