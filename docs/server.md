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
│   │   ├── types.ts        the schema as Kysely sees it
│   │   ├── migrate.ts      migration runner, also a CLI
│   │   └── migrations/     one file per migration, registered explicitly
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

The other 77 are specified but not built. [`docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/`](prds/2026-09-27-memory-shoebox/tech-specs/apis) carries the whole
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

## Database

SQLite through [Kysely](https://kysely.dev), with `better-sqlite3` underneath.

`createDatabase(path)` opens the file (creating its parent directory if
needed), enables write-ahead logging and foreign key enforcement, and returns a
`Kysely<Database>`. Pass `":memory:"` in tests.

`src/db/types.ts` declares the `Database` type: one property per table, mapping
a table name to its row shape. Kysely type-checks every query against it, so it
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
- Update `src/db/types.ts` in the same change.

Run them with `pnpm migrate` locally. In production they run automatically at
startup.

**One piece of debt worth naming.** Migration 0002 seeds the `everyone`
visibility rule at a constant id, and exports that constant as
`EVERYONE_VISIBILITY_RULE_ID` from `0002_visibility.ts` because something has
to name it for the seed insert itself. Two API slices (still unbuilt) will
need to resolve to that same id at runtime, and a migration is meant to be
frozen once shipped, so having runtime code reach into a historical migration
file for a value is a coupling nobody actually wants. Nothing in
`apps/server/src` imports it today (only the schema test does, to build a
fixture), so this is not a bug, just a debt: whichever later step first needs
the constant at runtime should move it into a non-migration module and have
the migration import it from there, rather than the other way around.

### `createId()`

`src/db/ids.ts` mints every primary key with `createId()`, which wraps the
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

`src/db/introspect.ts`, `schemaManifest.ts`, `schemaExpectations.ts`, and
`test/schema.test.ts` exist to keep this document, the `Database` type, and
the actual database from drifting apart.

`introspect.ts` reads the schema from a live database, not from migration
source: `sqlite_master`, `pragma_table_info`, `pragma_foreign_key_list`, and
`pragma_index_list`/`pragma_index_xinfo`. That is deliberate, and the reason is
specific: a migration that silently failed to apply, or was skipped, looks
identical in source to one that ran, but the two produce different databases.
Reading the source would assert that the migration file says what it says.
Reading the live database asserts that the file actually did what it says,
against a database `schema.test.ts` builds by running `migrateToLatest` for
real.

`schemaManifest.ts` is the runtime counterpart of `src/db/types.ts`: every
table, every column, and three facts about each one, which are whether SQLite
enforces it as `NOT NULL`, the type it was declared with, and its `DEFAULT`
expression. Nullability is tied to the `Database` type by a mapped type, so
the two cannot disagree without a compile error; type and default ride
alongside, because a Kysely row type says nothing about either (`INTEGER` and
`REAL` are both `number`, and a default is invisible) and both are asserted
against the live database instead. All three are read rather than assumed for
the same reason: SQLite's affinity rules let `items.byte_size` change from
`INTEGER` to `TEXT` without a single query failing.

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

`schema.test.ts` asserts all of it against the live database, including that a
partial index's `WHERE` predicate survived: several are load-bearing precisely
because they are partial, and a full index on the same columns would
type-check and silently change behavior. Column **direction** is asserted too,
which is why `readIndexes` reads `pragma_index_xinfo` rather than
`pragma_index_info`: only `xinfo` carries a `desc` flag, and eight of these
indexes are descending, `items_captured_on_rule_id` being the timeline's
primary sort. `introspect.ts` records the two limitations that remain, which
are expression indexes and the partial predicates the test reads separately.

## Backblaze B2

`src/b2/client.ts` exposes a small client over B2's S3-compatible API:
`listObjects`, `presignGetUrl`, and `putObject`. It is a factory returning an
object rather than a class, and it exposes only the operations Memory Shoebox needs,
which keeps it easy to fake in a test.

`presignGetUrl` signs for the seven-day S3 maximum by default and sets a
matching `Cache-Control`, so a browser that has already downloaded a photo does
not download it again. The tradeoff is spelled out in
[architecture.md](architecture.md#where-data-lives): a presigned URL is a
bearer link for as long as it lives.

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
