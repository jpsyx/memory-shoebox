# The shared contract (`packages/shared`)

`@memory-shoebox/shared` defines the HTTP contract between the web app and the API. It
is the only thing both halves import, and it exists so the two cannot silently
disagree about the shape of a payload.

## Layout

The package is a barrel over thirteen modules, `src/index.ts` re-exporting
each and holding no definitions of its own:

- `auth.ts`: the authentication slice's request and response schemas, plus
  `MeDto`, `SessionDto` and `NotifyPreferences`. `signInCodeSchema` lives here
  and `email.ts` imports it, so the six digits are spelled once rather than
  once per side of the round trip.
- `health.ts`: the schema and type for `GET /api/health`.
- `errors.ts`: the error envelope every non-2xx response uses, `details`
  included.
- `collectionSchema.ts`: the cursor primitive and `collectionSchema`, the
  envelope every paged response wears, so no slice invents a second one.
- `limits.ts`: every string length cap, so the web app's form validation and
  the server's request validation read the same numbers.
- `dtos.ts`: the twelve frozen DTOs, the shapes the API hands back for items,
  members, tags, milestones, and the rest.
- `settings.ts`: `SETTING_DEFINITIONS`, the registry of every settings key
  with its Zod schema, default, and scope, plus
  `getSettingValueFromStoredValue` for reading one against whatever the
  database actually holds. Two payloads sit beside the registry because both
  are subsets of it: `ShellSettings`, the three resolved values the app shell
  needs as it renders, and `PublicSettingsResponse` with the
  `PUBLIC_SETTING_KEYS` allow-list behind the one anonymous read.
- `email.ts`: the outbound mail contract: the seven kinds, the `EmailCommon`
  block every payload carries, the enqueue input, and `MailQueueHealth`. See
  [mail.md](mail.md).
- `timeline.ts`: the archive read path's shared selection and everything built
  on it: the day stream, the jump rail and the filter surface's request
  schemas, the day, band and strip shapes, the timeline and rail responses,
  and both facet schemas with the response that carries them. See
  [`tech-specs/apis/timeline.md`](prds/2026-09-27-memory-shoebox/tech-specs/apis/timeline.md).
- `vocabularies.ts`: the tag and people vocabularies the filter surface's
  chips and the people directory draw from, independent of any one day's
  selection: `GET /api/tags` and `GET /api/people`.
- `items.ts`: the item permalink and what hangs off it. `ItemDetail` and the
  path-parameter schemas every route in the slice parses, `ItemCapabilities`,
  `AttachedMilestone`, `BurstFrameRef` and the burst-frames response, the
  comment DTO, and `POST /api/items/seen`'s request. See
  [`tech-specs/apis/items.md`](prds/2026-09-27-memory-shoebox/tech-specs/apis/items.md).
- `itemEdits.ts`: every write on one item that is not a comment or a reaction:
  the alt text, the tag set, the people set, the visibility repoint for one
  item and for a selection, the capture-date correction, and
  `POST /api/visibility-rules/resolve`. **The bodies are narrow on purpose.**
  `PATCH /api/items/:itemId` takes one field, because widening it is how the
  rest of that contract gets bypassed: the capture date, visibility, tags and
  people each have a route with transformation steps a generic `PATCH` would
  skip.
- `comments.ts`: the conversation bodies. Creating a comment, editing one, and
  the one reaction schema both the item and the comment routes take. Every
  body is trimmed before it is measured, because a comment of four thousand
  spaces is not a long comment, it is an empty one. `atSeconds` is absent from
  the edit schema deliberately: a pin is fixed at creation, and moving it
  would slide a mark under everybody else reading the same transport bar.

## The one change to a frozen DTO

The twelve DTOs in `dtos.ts` were frozen by step 1, and the item slice changed
exactly one of them: **`VisibilitySummary` gained `visibilityRuleId`**
(`tech-specs/apis/items.md` § Additions requested 2). The edit control has to
pre-fill from the current rule and detect a no-op save, and a selection has to
know whether its items already share one rule before it offers to change them.
`subjects` pre-fills the form but carries no identity, so without the id a
client would have to re-resolve a digest it has no way to compute. The id is
opaque, reveals strictly less than the `subjects` list already beside it, and
only ever appears on an item the viewer can see.

**It is validated by `visibilityRuleIdSchema`, deliberately not by
`idSchema`.** Every other id in the contract is a uuidv7 primary key, and this
one usually is too, but the seeded `everyone` rule is the readable
`visibility-rule-everyone` so that an `items` row inspected in the `sqlite3`
shell says what it means
(`apps/server/src/visibility/everyoneRule.ts`). Validating it as a uuid would
reject the one rule every fresh Shoebox uses for everything, on the request
body of the visibility routes as well as in the response. The schema is
`z.string().min(1).max(64)` instead, and the 64 is the column's own cap.

The other request in that document, `MediaRef.original`, was **declined**:
widening `MediaRef` would put a full-resolution signed URL on every print in
every timeline page for a button that appears on one surface, and a payload
field cannot get a sensible filename into the download. It is
`GET /api/items/:itemId/original`, a 302 to a freshly signed URL, instead.

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
- **The server** imports both types and values. A type import is erased; a
  runtime import loads the package's TypeScript source through Node's type
  stripping, which works and is now the ordinary case.

### The constraint worth knowing

**It is not "types only".** A route that validates a request body, a query or
a path parameter has to hold the schema at runtime. That is now the ordinary
case rather than the exception: **every route module but `health.ts` imports
at least one value**, and four modules outside `routes/` do too.

| Module                                       | Imports                                                |
| -------------------------------------------- | ------------------------------------------------------ |
| `routes/*.ts`, all but `health.ts`           | That group's request, query and path-parameter schemas |
| `settings/readInstanceSettings.ts`           | `getSettingValueFromStoredValue`                       |
| `visibility/bumpVisibilityGeneration.ts`     | `getSettingValueFromStoredValue`                       |
| `members/getMemberRoleFromStoredValue.ts`    | `memberRoleSchema`                                     |
| `mail/templates/emailTemplates.constants.ts` | Each built kind's payload schema                       |

The route rows are deliberately one line rather than one per module: naming
them individually would go stale the next time a slice lands, and the fact
worth recording is the pattern, not the roll call. Each of them needs the
value rather than the shape. A schema is what turns a
request body or a `payload_json` blob, both genuinely `unknown`, into something
the contract has vouched for; asserting the type instead would be a claim
nobody checked.

The real constraint is what that costs: **anything this package exports has to
be plain, erasable TypeScript.** Node strips types rather than compiling them,
so nothing here may need code emitted for it, which rules out `enum`,
`namespace` and parameter properties, and relative imports inside the package
must carry their `.ts` extension so Node resolves them literally. That is the
same rule `apps/server` lives under, for the same reason, and oxlint enforces
the extension half of it across both packages.

`apps/server/test/sharedRuntimeImport.test.ts` is the standing guard. It
exercises one value from the registry and one route schema, so it covers the
pattern that is now routine rather than only the first value that was unusual.
If it ever fails, the package has grown something that does not survive
stripping, and the fix is to find that construct rather than to delete the
test.

**It was verified before anything depended on it**, two ways: under Vitest, and
under bare Node, the latter with

```sh
node --input-type=module -e "import('@memory-shoebox/shared').then((m) => console.log(Object.keys(m)))"
```

run from `apps/server`, which printed the package's full export list.

**The caveat, stated plainly rather than buried.** This was verified in the
development workspace, not inside the production container. The Dockerfile
copies `/app` wholesale from the builder stage so pnpm's relative symlinks
stay valid, and `zod` is a runtime dependency of the package rather than a
dev one, so the production shape should behave identically. "Should" is not
"does": the mitigation is a startup smoke test, and no such test exists yet.

## Adding to the contract

1. Add the schema and its inferred type to the module it belongs to, each
   with a docstring naming the endpoint it belongs to. `src/index.ts` is a
   barrel and holds no definitions: it re-exports, and **every name is listed
   there by hand**. A new symbol needs a line in its module's `export { ... }`
   block, and a new module needs a block of its own. There is no `export *`,
   so a name nobody lists is a name the package does not publish, which is the
   point: the list is where somebody decides that a symbol is public.
2. Use the type in the server's route handler.
3. Use the schema in the web app's `api/` module.
4. Update [api documentation](server.md#routes) if the endpoint is new.
