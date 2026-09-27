# API index template

Write this as `<specdir>/tech-specs/apis/README.md` **after the merge**, not before. Three
of its sections can only be written once you know what the slices did.

Build the route table by extracting the route headings from each slice file
rather than by hand: it is the only place a duplicate route is visible, and
finding one by eye across nine files does not work.

```sh
for f in <specdir>/tech-specs/apis/*.md; do
  grep -ohE '^#### `(GET|POST|PUT|PATCH|DELETE) /api/[^`]*`' "$f"
done | sort | uniq -d   # prints nothing if there are no collisions
```

---

```markdown
# The API contract

Every route <product> needs, derived from the <N> surfaces in
[`design-spec.md`](../../design-spec.md) and the schema in
[`data-models.md`](../data-models.md).
Written so a future agent can build either half against it without re-deriving
anything.

**Read [`conventions.md`](conventions.md) first.** It is binding on every route
here and wins wherever a slice disagrees: paths, the envelope, pagination,
field naming, the frozen DTOs, the error shape and the 404-never-403 rule, the
permission predicate, the request context, and the background jobs.

## The slices

| Slice               | What it covers | Surfaces  |
| ------------------- | -------------- | --------- |
| [<slug>](<slug>.md) | <one line>     | <numbers> |

## Every route, by path

<N> routes. Sorted by path, so a duplicate would sit on the line below its
twin. There are none.

| Method | Path       | Slice               |
| ------ | ---------- | ------------------- |
| `GET`  | `/api/...` | [<slug>](<slug>.md) |

## What is settled centrally rather than in a slice

<Why the conventions file exists, in five or six bullets. The frozen DTOs, the
404/403 line, the permission predicate, the middleware context, the jobs. This
section is what stops the next person adding a route that quietly invents its
own dialect.>

## What the merge changed

<Each slice was written blind to the others. List what reconciling them
changed, with where it was changed. In the reference run this was five things,
and every one would otherwise have been rediscovered as a bug.>

## Holes this found in the schema

<Building against a schema finds what designing it could not. List what the
slices uncovered, fixed in `data-models.md` rather than worked around here.
Each was invisible until something had to be built against it, which is why
this section is worth writing rather than quietly fixing.>
```

## The three sections people skip

The last three are the ones that make this file worth having a year later.

- **Settled centrally** is what stops the next route inventing its own dialect.
- **What the merge changed** is the record of decisions that look arbitrary
  later. Without it somebody "fixes" a deliberate inconsistency.
- **Holes this found** is the honest part. It is also the best evidence for why
  the contract phase is worth doing before implementation rather than during.
