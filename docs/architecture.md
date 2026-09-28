# Architecture

## Overview

Memory Shoebox is one service with three moving parts:

1. **Web app** (`apps/web`): a React single-page application. No server-side
   rendering, no server entry point, everything runs in the browser.
2. **API server** (`apps/server`): a Fastify process that owns a SQLite
   catalog, talks to Backblaze B2, and also serves the built web app.
3. **Backblaze B2 bucket**: the source of truth for media bytes. Photos and
   videos live here in their original quality and nowhere else.

`packages/shared` holds the TypeScript types and Zod schemas that define the
HTTP contract, so the two halves cannot drift apart.

```
                     photos and videos, direct (presigned URLs)
          ┌─────────────────────────────────────────────────────────┐
          │                                                         ▼
┌─────────┴───────┐     /api/*  JSON + session cookie     ┌──────────────────┐
│  Browser        │ ───────────────────────────────────▶  │  Fastify         │       ┌──────────────┐
│  React SPA      │ ◀───────────────────────────────────  │  + SQLite        │ ────▶ │  Backblaze   │
│                 │     /*      the SPA itself            │  catalog         │ ◀──── │  B2 bucket   │
└─────────────────┘                                       └──────────────────┘ list, └──────────────┘
          ▲                                                         │          sign,
          │              @memory-shoebox/shared (contract)                 │          upload
          └─────────────────────────────────────────────────────────┘
```

## Repository layout

A pnpm workspace (`pnpm-workspace.yaml` globs `apps/*` and `packages/*`).

```
memory-shoebox/
├── apps/
│   ├── web/             @memory-shoebox/web     React SPA (Vite, Mantine, TanStack)
│   └── server/          @memory-shoebox/server  Fastify API, SQLite, Backblaze B2
├── packages/
│   └── shared/          @memory-shoebox/shared  API contract: Zod schemas and types
├── docs/                                 this documentation
├── scripts/skills/                       coding-agent skill tooling
├── AGENTS.md                             coding conventions (CLAUDE.md links here)
├── Dockerfile                            one image containing both halves
├── fly.toml                              Fly.io app definition
└── package.json                          workspace scripts
```

Root scripts fan out with `pnpm -r`. `pnpm dev` runs the web and API dev
servers together; `pnpm check` runs formatting, linting, type-checking, the
build, and tests across every package.

Node 22.18 or newer is required. The server relies on Node's built-in type
stripping to execute `.ts` files directly, so it has no build step at all.

## One origin, one deployment

Memory Shoebox deploys as a **single Fly.io app**. Fastify answers `/api/*` itself and
serves the built SPA for every other path, falling back to `index.html` so
TanStack Router can resolve client-side routes.

This is the most consequential decision in the system, and it is made for the
self-hoster's benefit:

- One `fly deploy`, one domain, one TLS certificate, one thing to monitor.
- **No CORS configuration.** The web app and the API share an origin, so there
  is no allowlist to get wrong.
- **No cross-site cookies.** The session cookie can be `SameSite=Lax` rather
  than `SameSite=None; Secure`, which is both safer and less fragile across
  browsers and privacy settings.

Development mirrors this: Vite serves the SPA on port 5173 and proxies `/api`
to the API server on port 8080, so the browser sees one origin in development
too. Nothing in the app knows about a configurable API base URL, because there
is not one.

The cost is that the web build is coupled to the server deploy. For a project
whose deploy target is a single small machine, that is a fair trade.

## External dependencies

Three, and they fail differently.

|              | Holds                           | If it is down                                          |
| ------------ | ------------------------------- | ------------------------------------------------------ |
| Fly.io       | The app and the SQLite volume   | The instance is down                                   |
| Backblaze B2 | Every photograph and video      | Pages render, media does not load                      |
| Resend       | Sign-in codes and notifications | Existing sessions keep working; nobody new can sign in |

Resend arrives with authentication and is the one that can lock out the admin
as well as everybody else, so an existing session must survive a mail outage.

## Where data lives

**SQLite is a catalog, Backblaze is the store.** Media bytes never enter the
database and never pass through the server. SQLite holds metadata: who posted
what, when, captions, comments, invitations. It sits on a small persistent Fly
volume at `/data`, so it survives deploys and machine restarts.

**Browsers fetch media straight from B2.** When the app needs to show a photo
or play a video, the server signs a time-limited URL and the browser fetches
the bytes from Backblaze directly. The server never proxies large files, so its
memory and bandwidth stay flat no matter how much media an instance holds.

The tradeoff is that a presigned URL is a bearer link for as long as it lives:
anyone holding one can fetch that object without a session. Memory Shoebox accepts
that in exchange for keeping media out of the server's data path, and manages
it by keeping URLs scoped to a single object.

## Request flow

**A page load.** The browser requests `/`, Fastify serves `index.html` and the
static bundle, and the SPA takes over. Any subsequent in-app navigation is
resolved client-side by TanStack Router; a hard refresh on a deep link hits the
server's SPA fallback and lands in the same place.

**A data read.** The SPA calls `/api/...` through `apiFetch`, which parses the
response with the Zod schema from `@memory-shoebox/shared`. TanStack Query caches it.
Reads are served from SQLite, so they do not touch Backblaze.

**Showing media.** The app asks the server for a signed URL for a given object,
then points an `<img>` or `<video>` at it. The bytes come from Backblaze.

**Opening a link.** Every post, photo, and video is addressable by its own URL,
and those URLs get shared between members as a matter of course. They are
addresses, not credentials: the server authorizes the viewer, never the link.
An unauthenticated request for one leads to the login screen and then back to
the item. The SPA fallback above is what lets a deep link survive a cold load;
the data behind it still has to pass the same authorization as any other read.
Signed storage URLs are a separate thing, minted while rendering a page and
never what a user copies. See [PRODUCT.md](PRODUCT.md#sharing).

## Key decisions

| Decision                                     | Why                                                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Single Fly app serving API and SPA           | One deploy, one origin, no CORS, no cross-site cookies. Simplest thing a self-hoster can operate.                                                                                    |
| SQLite rather than Postgres                  | An instance serves tens of people. The archive it indexes runs to many thousands of items, which is still small for SQLite as long as queries are indexed. One fewer service to run. |
| Media in object storage, not in the database | Keeps the database small and the server out of the data path for large files.                                                                                                        |
| Presigned URLs rather than proxying media    | The server never streams bytes, so its cost does not scale with media volume.                                                                                                        |
| No server build step                         | Node strips types at load time. Development and the production image run the same files.                                                                                             |
| Shared Zod schemas as the contract           | One definition per payload, validated at the client boundary, with types inferred from it for both sides.                                                                            |
| Kysely rather than a full ORM                | Typed SQL without a second mental model on top of the schema.                                                                                                                        |

## What is not built yet

Memory Shoebox is early, and the build is
[fifteen steps](prds/2026-09-27-memory-shoebox/plan/README.md) long. Two are
done.

**Step 1 built the schema.** Thirty-three tables, every foreign key and every
index, applied by migrations that run at boot. What each table means is
[`data-models.md`](prds/2026-09-27-memory-shoebox/tech-specs/data-models.md);
how the migrations are organised is [server.md](server.md).

**Step 2 built the server spine**, which is everything under `apps/server` that
is not a route and that every route needs: the request context, the one error
envelope, rate limiting in the middleware, the seven background jobs, the
Backblaze client, and the outbound mail queue with its worker and its renderer.
See [server.md](server.md) and [mail.md](mail.md).

**There are no product features on top of it.** No accounts, no items, no
uploads, no comments, and `GET /api/health` is still the only endpoint: the
contract's seventy-eight routes are specified and unbuilt. Of the
seven kinds of email, one has copy.

See [PRODUCT.md](PRODUCT.md) for where this is heading.
