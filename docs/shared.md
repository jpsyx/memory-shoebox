# The shared contract (`packages/shared`)

`@famgram/shared` defines the HTTP contract between the web app and the API. It
is the only thing both halves import, and it exists so the two cannot silently
disagree about the shape of a payload.

## What goes in it

For each endpoint, a **Zod schema** and the **type inferred from it**:

```ts
/** Response body of `GET /api/health`. */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
  uptimeSeconds: z.number().int().nonnegative(),
});

/** Response body of `GET /api/health`. */
export type HealthResponse = z.infer<typeof healthResponseSchema>;
```

One definition per payload. The web app parses responses with the schema; the
server annotates its handlers with the type. Changing the shape in one place
breaks the other at compile time, which is the entire point.

What does **not** belong here: anything either side can keep to itself. Server
internals, database row types, component props, and UI state are not part of
the contract.

## How it is consumed

The package ships TypeScript source. There is no build step: its `exports` map
points directly at `src/index.ts`.

- **The web app** imports it normally. Vite compiles it as part of the bundle.
- **The server** imports **types only**, with `import type`. Those imports are
  erased at compile time and nothing is loaded at runtime.

### The constraint worth knowing

The server runs TypeScript directly through Node's type stripping, and it
resolves imports the way Node does. Runtime imports from a workspace package of
TypeScript source are therefore delicate in a way that type-only imports are
not.

So: **from the server, import only types from `@famgram/shared`.** If the
server ever needs a runtime value from this package (a Zod schema for
validating a request body, say), verify it actually loads under `pnpm start`
before relying on it, and record the result here. Until then, server-side
request validation defines its schemas in `apps/server`.

## Adding to the contract

1. Add the schema and its inferred type to `src/index.ts`, each with a
   docstring naming the endpoint it belongs to.
2. Use the type in the server's route handler.
3. Use the schema in the web app's `api/` module.
4. Update [api documentation](server.md#routes) if the endpoint is new.
