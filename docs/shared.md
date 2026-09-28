# The shared contract (`packages/shared`)

`@memory-shoebox/shared` defines the HTTP contract between the web app and the API. It
is the only thing both halves import, and it exists so the two cannot silently
disagree about the shape of a payload.

## Layout

The package is a barrel over seven modules, `src/index.ts` re-exporting each
and holding no definitions of its own:

- `health.ts`: the schema and type for `GET /api/health`.
- `errors.ts`: the error envelope every non-2xx response uses, `details`
  included.
- `collections.ts`: the cursor primitive and `collectionSchema`, the envelope
  every paged response wears, so no slice invents a second one.
- `limits.ts`: every string length cap, so the web app's form validation and
  the server's request validation read the same numbers.
- `dtos.ts`: the twelve frozen DTOs, the shapes the API hands back for items,
  members, tags, milestones, and the rest.
- `settings.ts`: `SETTING_DEFINITIONS`, the registry of every settings key
  with its Zod schema, default, and scope, plus
  `getSettingValueFromStoredValue` for reading one against whatever the
  database actually holds.
- `email.ts`: the outbound mail contract: the seven kinds, the `EmailCommon`
  block every payload carries, the enqueue input, and `MailQueueHealth`. See
  [mail.md](mail.md).

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
not. **Two have happened.** `apps/server/src/settings/instanceSettings.ts`
imports `getSettingValueFromStoredValue` as a value rather than a type,
because reading a setting on an instance with no `settings` rows means running
the package's defaults rather than naming their shape, and
`apps/server/test/sharedRuntimeImport.test.ts` is the standing check that it
loads. `apps/server/src/mail/templates/registry.ts` imports
`signInCodeEmailPayloadSchema` for the same kind of reason: the mail worker
reads `payload_json` back out of SQLite, so what it holds is genuinely
`unknown`, and the only honest way to hand it to a template is to run the
kind's schema over it rather than to assert its shape. Everything else under
`apps/server/src` is still `import type`.

**It was verified before anything depended on it.** A runtime import from `@memory-shoebox/shared` loads
under Node's type stripping. Confirmed two ways: under Vitest, and under bare
Node, the latter with

```sh
node --input-type=module -e "import('@memory-shoebox/shared').then((m) => console.log(Object.keys(m)))"
```

run from `apps/server`, which printed the package's full export list,
`SETTING_DEFINITIONS` and `getSettingValueFromStoredValue` included.

`SETTING_DEFINITIONS` is why this stopped being hypothetical: it holds Zod
schemas and defaults, and resolving a setting on a fresh instance (one with
zero rows in `settings`) means executing code from the package, not just
naming its type.

If that check ever fails, the fix is to move settings resolution into
`apps/server`, not to delete the test.

**The caveat, stated plainly rather than buried.** This was verified in the
development workspace, not inside the production container. The Dockerfile
copies `/app` wholesale from the builder stage so pnpm's relative symlinks
stay valid, and `zod` is a runtime dependency of the package rather than a
dev one, so the production shape should behave identically. "Should" is not
"does": the mitigation is a startup smoke test, and no such test exists yet.

## Adding to the contract

1. Add the schema and its inferred type to the module it belongs to, each
   with a docstring naming the endpoint it belongs to. `src/index.ts` is a
   barrel and holds no definitions: it re-exports, and a new module needs a
   line added there.
2. Use the type in the server's route handler.
3. Use the schema in the web app's `api/` module.
4. Update [api documentation](server.md#routes) if the endpoint is new.
