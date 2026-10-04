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
HTTP contract, so the two halves cannot drift apart. `packages/emails` holds
the copy of every message the server sends.

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
│   ├── shared/          @memory-shoebox/shared  API contract: Zod schemas and types
│   └── emails/          @memory-shoebox/emails  the copy of every message, compiled
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

**One package is the exception, and it is worth knowing why before you meet
it.** `packages/emails` compiles, and `apps/server` imports its output rather
than its source. Type stripping removes annotations and transforms nothing, and
the email templates are JSX, which is not an annotation: it has to be rewritten
into function calls by something. So the copy lives in a package that emits,
and the build order everywhere, `pnpm dev` and the `Dockerfile` alike, puts it
first. The server still has no build step of its own, and it never learns that
this dependency had one. [emails.md](emails.md) has the full reasoning and the
one-line reproduction.

## One origin, one deployment

Memory Shoebox deploys as a **single Fly.io app**. Fastify answers `/api/*` itself and
serves the built SPA for every other path, falling back to `index.html` so
TanStack Router can resolve client-side routes.

This is the most consequential decision in the system, and it is made for the
self-hoster's benefit:

- One `fly deploy`, one domain, one TLS certificate, one thing to monitor.
- **No CORS configuration on the API.** The web app and the API share an
  origin, so there is no allowlist to get wrong. **The bucket is the one
  exception, and it needs one**: the browser uploads straight to Backblaze,
  whose origin is not the app's, so the bucket carries a CORS rule allowing
  `PUT`, `GET` and `HEAD` from the instance's own address, the `content-type`
  request header, and an exposed `ETag`. `pnpm b2:cors` writes it; see
  [deployment.md](deployment.md).
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

**And they upload straight to it.** The server presigns a PUT, or the parts of
a multipart upload, and the browser sends the bytes to Backblaze itself; the
server only checks afterwards, with a `HEAD` or by completing the multipart
upload. The browser also makes the derivatives, a `display` copy, a `thumb`
and a video's `poster`, because the server never holds the bytes to make them
from. An item exists only once its bytes are in the bucket.

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
| No server build step                         | Node strips types at load time. Development and the production image run the same files. `packages/emails` is the one thing that compiles, because JSX cannot be stripped.           |
| Shared Zod schemas as the contract           | One definition per payload, validated at the client boundary, with types inferred from it for both sides.                                                                            |
| Kysely rather than a full ORM                | Typed SQL without a second mental model on top of the schema.                                                                                                                        |

## What is not built yet

Memory Shoebox is early, and the build is
[fifteen steps](prds/2026-09-27-memory-shoebox/plan/README.md) long. Eleven
are done: 1, 2, 3a, 3b, 4a, 4b, 5a, 5b, 6a, 6b and 7a.

**Step 1 built the schema.** Thirty-three tables, every foreign key and every
index, applied by migrations that run at boot. What each table means is
[`data-models.md`](prds/2026-09-27-memory-shoebox/tech-specs/data-models.md);
how the migrations are organised is [server.md](server.md).

**Step 2 built the server spine**, which is everything under `apps/server` that
is not a route and that every route needs: the request context, the one error
envelope, rate limiting in the middleware, the seven background jobs, the
Backblaze client, and the outbound mail queue with its worker and its renderer.
See [server.md](server.md) and [mail.md](mail.md).

**Step 3a built identity and access**: signing in with a six-digit code,
sessions and the devices list, a member's own account, the anonymous settings
read the sign-in page needs, and the visibility predicate every later read
route composes. See [auth.md](auth.md).

**Step 3b built the web app's shell**: the design system and the Mantine
theme lifted out of `prototypes/`, the route map, the two shells (signed out
and signed in), the route guard, and an `apiFetch` that carries the error
envelope's full `details`. See [web.md](web.md).

**Step 4a built the archive read path**: the day stream with its milestone
bands and its per-viewer counts, the jump rail, filtering and search, the tag
and people directories, and the one-way latch that clears the accent dots. Six
routes, every count computed for the viewer who asked and none of them stored.
See [archive.md](archive.md).

**Step 4b joined the two halves**: surfaces 1 and 9, live against 3a's routes.
Somebody can open a link they were sent, be redirected to sign in, type their
address, receive a six-digit code, type it, and land on what they were sent.
They can then correct their name, change a notification switch, and sign a lost
phone out and watch it stop working. The route guard resolves a real session
rather than a placeholder viewer. See [web.md](web.md) for the two surfaces and
[e2e.md](e2e.md) for the browser-driven layer that proves them.

**Step 5a built everything that hangs off one photograph**: the item and its
capabilities, comments, reactions, tags and people, visibility, the
capture-date correction, and deletion with its object cleanup. Eighteen
routes. See [server.md § The item slice](server.md#the-item-slice).

**Step 5b put a screen on the read path**: the pile grouped by day, the jump
rail, the burst that fans in place, the filter and search surface, the people
directory, and the two empty states that stay indistinguishable on the wire.
Signing in now lands on the archive rather than on a placeholder. It added no
route, no service and no migration: everything it wrote under `apps/server` is
a development seed, because uploading is step 7b and without one there is
nothing to look at.
See [web.md](web.md) and
[archive.md § The client half](archive.md#the-client-half).

**Step 5a built one item's routes**: the permalink that counts an open,
comments and reactions, tags and people, who can see it, the capture date,
deletion, a burst's frames and the download of the original. See
[server.md](server.md) § The item slice.

**Step 6a built the upload session end to end**: twelve routes from
opening a draft to the settle latch that sends exactly one email per
recipient, the capture-date ladder, burst detection, both halves of the
abandon sweep, and a headless engine in the browser that hashes each file,
makes its derivatives and puts the bytes straight into the bucket. It has no
surface: surface 8 is step 7b, and until then the engine is driven by a
development-only harness page. See
[server.md § The upload slice](server.md#the-upload-slice) and
[web.md § The upload engine](web.md#the-upload-engine).

**Step 6b put one item on screen**: surfaces 3 and 4, live against 5a's
routes. A print in the pile opens the photograph or video it is, with its burst
beside it, its thread, its reactions and the controls the server says this
viewer may use, and a comment can be pinned to a moment of a video. It added no
route: everything it wrote is under `apps/web` and `e2e/`. See
[web.md](web.md) § Surfaces 3 and 4 and [e2e.md](e2e.md) § Surfaces 3 and 4.

**Step 7a built milestones and removal requests**: nine occasion routes for
spans, attachment deltas, candidate reads and date reconciliation, plus five
removal routes. Tagged members can ask; decline, withdrawal and item deletion
settle the request with transactional mail. The hourly job queues one reminder
per current recipient and local calendar week until settlement. All five
removal email bodies render from frozen payloads. See [milestones.md](milestones.md),
[removals.md](removals.md) and [emails.md](emails.md).

**Members can sign in, read the archive, act on one photograph or video, and
upload batches through the server's routes.** An uploader can tag an item,
name who is in it and describe it; its own uploader or an admin can change who
sees it, correct its date or delete it. Fifty-nine of the contract's
seventy-eight routes are built. The upload engine has passed its real-bucket
proof, but the product does not call it until step 7b draws surface 8, so a
real instance's archive still starts at the empty state. Of the seven kinds
of email, six have copy and a caller: the sign-in code, comment, upload, removal
request, removal reminder and removal resolution.

**Eight surfaces of the eighteen are built, and the rest are still mockups in
`prototypes/`.** Uploading is step 7b; asking for a photograph to come down and
creating an occasion are step 8b; members, groups, settings, presence and the
change log are step 9.

See [PRODUCT.md](PRODUCT.md) for where this is heading.
