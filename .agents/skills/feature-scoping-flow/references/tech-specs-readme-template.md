# tech-specs/README.md template

Copy into `<specdir>/tech-specs/README.md`. Short on purpose: it is a signpost,
and a long one does not get read.

---

```markdown
# Technical specification

How <product or feature> is built, derived from the surfaces in
[`../design-spec.md`](../design-spec.md) and the requirements in
[`../PRD.md`](../PRD.md).

Written in this order, because each depends on the one before it:

| #   | Document                           | What it settles                                                                      |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | [`data-models.md`](data-models.md) | Every table, key, cascade and index, and what is deliberately not stored             |
| 2   | [`apis/`](apis)                    | Every route, its request and response types, and the conventions binding all of them |

## Where to start

**Building the database:** `data-models.md` top to bottom. Its conventions
section and its permission model are assumed by everything else.

**Building or calling a route:** [`apis/README.md`](apis/README.md) for the
route you want, then
[`apis/conventions.md`](apis/conventions.md) **before you write anything**. The
conventions file is binding on every route and settles the things most easily
got wrong: what returns 404 rather than 403, which counts are filtered per
viewer, and the shared types no slice may redefine.

**Changing something:** both. A schema change with no route change is usually a
misunderstanding of one of them.

## What is not here

Implementation order and task breakdown are in [`../plan/`](../plan). This
directory says what the system is, not what to build first.
```
