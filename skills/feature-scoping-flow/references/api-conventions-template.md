# API conventions template

Write this as `<specdir>/tech-specs/apis/conventions.md` **before dispatching any slice
agent**, and tell every agent to read it first and that it wins wherever their
slice disagrees.

It is the single thing that makes eight documents written in parallel merge
into one contract. Everything below was load-bearing in the reference run;
sections marked **project** need a real decision rather than a copy.

---

````markdown
# API conventions

Binding on every route in `<specdir>/tech-specs/apis/`. Written before any slice, so that
N documents produced in parallel merge into one contract rather than N dialects
of one. Where this file and a slice disagree, this file wins.

## Paths [project]

- Everything under `/api`. Plural, kebab-case resource segments.
- **No role prefix, ever.** Role is an attribute of a route, declared in its
  header, not a path segment. One resource whose shape varies by role is one
  path.
- Nest sub-resources one level only. Go deeper by promoting to top level.
- Verbs only where REST cannot express the action, and then as a noun
  sub-resource (`POST /api/<thing>/:id/commit`). Never `POST /api/doSomething`.
- Path params are camelCase and suffixed `Id`.
- **`PUT` on a sub-collection replaces it; `PATCH` applies a delta.** Which is
  correct is decided by whether the viewer can see the whole collection. If
  their visible portion is not the whole, a replace silently deletes what they
  cannot see, so it must be `PATCH`.

## Envelope [project]

- A single resource is the body. No wrapper.
- A collection is `{ "<resourceKey>": T[], "nextCursor": string | null }`.
  Never a bare top-level array.
- A mutation returns the resource in its post-mutation read shape. `204` only
  where there is genuinely nothing to return.
- **`201` wherever a new id is minted**, `200` for every other mutation.

## Pagination

Cursor only, never offset. `?limit=<n>&cursor=<opaque>`; the server caps
`limit` and states the cap. `nextCursor: null` means the end. The cursor is
opaque to the client; state per route what it encodes.

## Field naming

- JSON is camelCase; the database is snake_case; the mapping is mechanical.
- Timestamps ISO-8601 UTC, field suffix `At`. Calendar dates `YYYY-MM-DD`,
  suffix `On`.
- **No formatted or relative date string in any payload.** Send the timestamp;
  the browser formats it, where the reader's locale is.
- Counts suffix `Count`, and every one is the viewer-filtered count.
- Booleans take an `is` / `has` / `can` prefix.

## Types

Express every request and response as a TypeScript type in the document.
**Do not write validation-library code**: one dialect is generated from these
after the merge, and N hand-written ones would not merge.

Follow the repository's own TypeScript conventions in `docs/rules/`. A final
conformance pass checks this, but writing it right the first time is cheaper.

## The frozen DTOs [project]

Settled. Use them by name. Do **not** redefine, widen inline, or invent a
near-duplicate. If your slice needs a field one lacks, put it in your
"Additions requested" section and keep using the frozen shape.

<The 8 to 12 types more than one slice needs. Get these right: five slices
needing the central entity will otherwise produce five versions of it.>

## Errors [project]

One shape everywhere. Extend whatever the repo already ships rather than
replacing it.

| Status | When                                                      | Canonical code                   |
| ------ | --------------------------------------------------------- | -------------------------------- |
| 400    | Malformed or failed validation                            | `invalid_request` + field errors |
| 401    | No session                                                | `not_signed_in`                  |
| 403    | **Role or capability.** They can see it and may not do it | `<domain>_forbidden`             |
| 404    | Does not exist, **or they may not see it**                | `<domain>_not_found`             |
| 409    | State conflict                                            | `<domain>_conflict`              |
| 429    | Rate limited                                              | `rate_limited` + retry seconds   |

**The 404 rule is absolute.** Any route addressing a row the viewer's
permission predicate excludes returns a byte-identical 404 to a nonexistent id:
same status, same code, same message. A 403 confirms something exists at that
id.

The line between them is one question, not two: **404 means you may not see it;
403 means you can see it and may not do it.**

## The permission predicate [project]

<The actual SQL, written once. N paraphrases of one predicate is how a leak
happens.> Computed once per request by the middleware, never per route.

## The request context [project]

<The shape the middleware attaches before any handler runs. Tell agents to
assume it exists and not to design it.>

## Forbidden in any payload [project]

- Any field that distinguishes an empty resource from one the viewer cannot
  see. The two must be byte-identical on the wire.
- Any count that permissions can filter, served from a stored column.
- Any internal ordering or index column, which leaks filtered rows through the
  gaps in its sequence.
- Raw storage keys, IP addresses, or anything the product promises not to keep.

## Who may change a thing [project]

<If the spec uses one word for two levels of authority, name the split here
once. Splitting by consequence works better than splitting by table:
destructive and access-changing actions belong to the owner; additive,
cheap-to-correct ones can be open to anyone with the role.>

## Citing

Cite the schema, never restate it: `(data-models.md § <table>)`,
`(Decision N)`. If a fact you need is not there, say so in "Open questions"
rather than inventing it.

## Per-route template

Used for every route, without exception.

​```markdown

#### `METHOD /api/path`

**Surface** <n> `<name>`, states `<a>`, `<b>`
**Auth** session required | anonymous · **Role** <role>
**Request** <type, with path, query and body each labelled>
**Response** `200` <type>
**Errors** | status | code | when |
**Transformations** what the server computes that the schema does not imply
**Performance** index used · N+1 risk · what must be one query not a loop
​```

## Document structure

1. `# <Slice name>` and a scope paragraph naming what is **not** here
2. A route table: method, path, auth, role, one-line purpose
3. One section per route, grouped by resource
4. `## Shared types in this slice`
5. `## Additions requested to the frozen DTOs` (may be empty)
6. `## Open questions for the coordinator` (may be empty)

No introduction, no conclusion, no summary of the data model.

---

# What no slice owns [project]

Settled here, not redefinable by a slice: the auth middleware and its cookie,
rate limits, background jobs (not HTTP, so nobody owns them, but several slices
depend on them), the settings registry, and the error-code registry that slices
append to.
````
