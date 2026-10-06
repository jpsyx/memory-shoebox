# Routing rules

The web app routes with [TanStack Router](https://tanstack.com/router) v1
(file-based). There is no TanStack Start, no server-side rendering, and no
server entry point in `apps/web`.

Routes are file-based: add a file under `apps/web/src/routes/` and the TanStack
Router Vite plugin regenerates `apps/web/src/routeTree.gen.ts` automatically.
Never edit `routeTree.gen.ts`, or any other `*.gen.*` file, by hand.

The dev server runs at http://localhost:38473 and proxies `/api` to the API
server on http://localhost:8080, so the browser always sees a single origin.
That matches production, where one Fastify process serves both. Never introduce
a configurable API base URL.

## Server routes

API routes are Fastify route modules under `apps/server/src/routes/`, mounted
under the `/api` prefix. A module declaring `GET /health` is reachable at
`/api/health`. Group them by resource, one module per group, and register them
in `apps/server/src/app.ts`.

Everything that is not `/api/*` belongs to the SPA: the server falls back to
`index.html` so the client-side router can resolve the path. See
[`../server.md`](../server.md#serving-the-web-app).
