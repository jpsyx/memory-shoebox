# Phase 5: the data models

## Why subagents

Every surface and every state has to be read. One agent doing that will exhaust
its context before it exhausts the surfaces, and the schema it writes will be
weighted toward whatever it read last.

**REQUIRED:** `superpowers:dispatching-parallel-agents`.

## Slicing

**Slice by surface cluster, not by table.** A per-table slice has every agent
inventing the same central entity from a different angle, and you merge five
incompatible versions of it. A cluster slice gives each agent a coherent region
of the product and a reason to care about its edges.

Six to eight agents is the usual range. Each gets:

- The specific surfaces and states to read, by path
- The spec, by path
- A required output shape, so the reports can be compared side by side
- **Read-only.** They report; they do not write the schema

Ask each for: entities with fields and types, relationships and cardinality,
what cascades on delete and what must refuse, and anything the surface implies
that no other surface would know.

## Merging is your job, not theirs

Read all the reports, then write one schema. This is where the real work is:

- **Deduplicate.** Five agents will describe the same entity. Reconcile field
  by field rather than taking the longest version
- **Resolve contradictions explicitly**, and record why. Two agents disagreeing
  usually means the surfaces genuinely disagree, which is a spec bug worth
  naming
- **Decide the cascades yourself.** This is the highest-stakes part of the
  schema and it is not a reporting question. In the reference run one choice
  (`RESTRICT` rather than `CASCADE` on deleting a group) was the difference
  between a confirmation dialog and silently revealing fifty hidden
  photographs

## Where it goes

`<specdir>/tech-specs/data-models.md`, beside the contract it feeds. Not at the top
of `docs/`: the schema is an artifact of this specification, and a reader who
finds it loose in `docs/` has no way to tell which spec it answers or whether
it is still current.

## What the document must carry

Beyond the tables: the conventions (id type, timestamp format, naming), the
permission or visibility model and how it is evaluated, the cascade matrix,
what is deliberately **not** stored and why, the queries that will hurt first
with the index each needs, and numbered open questions.

Write the reasoning for anything non-obvious. A table listing is cheap to
regenerate; the argument for why a column is not there is not.

## The agents will find bugs in the prototypes

They read every state carefully, which nobody has done since building them.
Expect three or four real defects. Fix them.

## Then walk the open questions

Exactly as phase 4. The schema's open questions are usually sharper than the
spec's, because they are forced: a nullable column is a question somebody has
to answer.
