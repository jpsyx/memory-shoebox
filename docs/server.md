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

The other 77 are specified but not built. [`docs/api/`](api) carries the whole
contract: one document per route group, matching the module-per-resource layout
above, plus [`conventions.md`](api/conventions.md), which is binding on all of
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
has to be updated alongside each migration. Memory Shoebox has no tables yet;
[data-model.md](data-model.md) is what the first migrations implement.

### Migrations

Migrations live in `src/db/migrations/` as `NNNN_description.ts`, each
exporting a `Migration`, and are registered by hand in `migrations.ts`. They
are registered rather than discovered from disk on purpose: the server runs
TypeScript directly, and a filesystem-scanning provider behaves differently in
development and inside the container.

Rules:

- Keep the zero-padded numeric prefix. Kysely orders migrations by key.
- Never edit or reorder a migration that has already shipped. Deployed
  databases have recorded it as applied and will not run it again.
- Update `src/db/types.ts` in the same change.

Run them with `pnpm migrate` locally. In production they run automatically at
startup.

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
  resolves them literally. oxlint enforces this for `apps/server/**` and
  enforces the opposite everywhere else.
- **Only import types from `@memory-shoebox/shared`** unless you have checked that the
  runtime import works under type stripping. See [shared.md](shared.md).
- Everything else follows the repository-wide rules in
  [`AGENTS.md`](../AGENTS.md) and [rules/typescript.md](rules/typescript.md).
