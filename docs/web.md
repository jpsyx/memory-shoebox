# The web app (`apps/web`)

A React 19 single-page application built with Vite, styled with
[Mantine](https://mantine.dev), routed by
[TanStack Router](https://tanstack.com/router), and fetching through
[TanStack Query](https://tanstack.com/query). There is no server-side
rendering and no server entry point: everything runs in the browser.

## Layout

```
apps/web/
├── index.html              the single HTML document
├── vite.config.ts          plugins, dev server, /api proxy
├── src/
│   ├── main.tsx            mounts React and the app-wide providers
│   ├── router.ts           creates the router and registers its types
│   ├── queryClient.ts      the TanStack Query client
│   ├── theme.ts            the Mantine theme
│   ├── index.css           global styles
│   ├── routes/             file-based routes
│   ├── routeTree.gen.ts    generated. Never edit.
│   └── api/                the typed API client
└── vitest.config.ts
```

## Providers

`src/main.tsx` mounts three providers, outermost first:

1. `QueryClientProvider` with the shared client from `src/queryClient.ts`.
2. `MantineProvider` with the theme from `src/theme.ts`.
3. `RouterProvider` with the router from `src/router.ts`.

The query client retries once and does not refetch on window focus. Famgram
talks to its own server on the same origin, so a failed request usually means
something is actually wrong and is worth surfacing rather than retrying away.

## Routing

File-based. Add a file under `src/routes/` and the TanStack Router Vite plugin
regenerates `src/routeTree.gen.ts`. Never edit that file, or any other
`*.gen.*` file, by hand. `src/router.ts` registers the router type globally so
route params and search params are typed everywhere.

Because routing is client-side, a hard refresh on a deep link reaches the
server, which serves `index.html` and lets the router resolve the path. See
[server.md](server.md#serving-the-web-app).

## Talking to the API

Two modules under `src/api/`:

- **`client.ts`** holds `apiFetch`, which prefixes `/api`, sends credentials,
  turns a non-2xx response into an `ApiRequestError` carrying the server's
  error code, and **parses the response body with a Zod schema**. Responses are
  validated rather than trusted, so a client and server that have drifted apart
  fail loudly at the boundary instead of producing `undefined` five components
  deep.
- **One module per resource**, exporting TanStack Query `queryOptions` rather
  than hooks. Options can be used by a component, a route loader, or a
  prefetch; a hook can only be used by a component. `health.ts` is the example
  to copy.

There is no configurable API base URL, by design. The API is always at `/api`
on the same origin: Fastify serves both in production, and the Vite dev server
proxies `/api` to port 8080 in development. See
[architecture.md](architecture.md#one-origin-one-deployment).

## Development server

`pnpm dev:web` starts Vite on **http://localhost:5173** with `strictPort`
behavior left at Vite's default. `/api` is proxied to `http://localhost:8080`,
so the API server has to be running too. `pnpm dev` from the repository root
starts both.

## Styling

Mantine components and theme tokens, CSS Modules for anything custom. No
TailwindCSS. The full rules are in [rules/styling.md](rules/styling.md).

The visual language, the palette, and the tone of the interface are not
documented yet. They get their own pass. Until then, the placeholder home page
is exactly that: a placeholder.

## Tests

Vitest, configured for a Node environment because there are no component tests
yet. When you write the first one, install `jsdom` plus a DOM testing library
and switch `environment` to `"jsdom"` in `vitest.config.ts`.
