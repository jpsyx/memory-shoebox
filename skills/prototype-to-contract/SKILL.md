---
name: prototype-to-contract
description: Use when taking a product or a large feature from nothing to a buildable plan, when a repo has surfaces to design before any schema or API exists, or when asked to go from mockups to data model to API contract to an implementation plan
---

# Prototype to Contract

Six phases that turn an idea into a plan another agent can build from, by
designing every surface first and deriving the schema, the API and the build
order from what the surfaces turned out to need.

**Core principle:** the mockups are the requirements. A surface you have drawn
every state of is a surface whose edge cases you have already found, and a
schema derived from 100 drawn states has fewer holes than one designed from a
feature list.

**REQUIRED BACKGROUND:** `superpowers:brainstorming`,
`superpowers:dispatching-parallel-agents`, `superpowers:writing-plans`.

## When to Use

- A new product, or a feature large enough to touch several screens
- The repo has no schema and no API yet, or this feature needs its own
- Somebody asks for "mockups then a data model then endpoints"

**Do not use for:** a bounded change to a flow that already exists. That is
`superpowers:brainstorming` on the bounded path and nothing more.

## The Phases

| #   | Phase               | Output                                                |
| --- | ------------------- | ----------------------------------------------------- |
| 1   | Design language     | `DESIGN.md`                                           |
| 2   | Prototypes and spec | `prototypes/`, spec with open questions               |
| 3   | The question walk   | Settled spec, rebuilt prototypes, approval            |
| 4   | Data model          | `data-model.md`                                       |
| 5   | API contract        | `api.md` and one file per route group                 |
| 6   | Build plan          | `plan/step-1.md` … `plan/step-N.md`, `plan/README.md` |

Phases 1 to 3 are collaborative and end at a human gate. Phases 4 to 6 fan out
to subagents and end with you merging their work.

**Where things go.** Decide once, at the start of phase 2, and say which:

- **Whole product:** the spec is `docs/PRODUCT.md`. Everything else goes in
  `docs/` at top level (`docs/data-model.md`, `docs/api/`).
- **One feature:** everything goes in `docs/specs/YYYY-MM-DD-<feature-name>/`
  as `spec.md`, `data-model.md`, `api.md`, `plan/`.

This skill writes paths as `<specdir>/`. Substitute accordingly.

## Phase 1: settle the look

Skip entirely if `DESIGN.md` exists.

Pick the 3 to 5 surfaces that carry the most of the product's character and
prototype them with impeccable (`/shape`, then the usual impeccable loop).
**Plain HTML and CSS. No framework, no repo UI library, no build step.** The
question in this phase is what the thing looks like, and a framework only slows
that down.

Then `/document` writes `DESIGN.md`. That file is the normative visual record
from here on.

See `references/phase-1-design-language.md`.

## Phase 2: every surface, every state, and a complete spec

Two outputs of equal weight, and the second is the one that gets forgotten:

1. High-fidelity mockups of **every surface in every state** in `prototypes/`.
2. A **complete functional spec**, including a numbered list of open questions.

**Now you must use the repo's UI libraries.** If the repo uses Mantine, build
Mantine components and a real Mantine theme; the point of this phase is to turn
the design language into a design system expressed in the tools the product
will actually ship with, so a future developer lifts components and theme
across rather than reinterpreting a picture.

**Do not use a full-stack framework.** React, the UI library and a router are
as much implementation fidelity as is useful. No TanStack Start, no SSR, no
data layer, no API.

Run `/shape` for the design work, and run `superpowers:brainstorming` alongside
it for the functional interrogation. **Ask about things that will never appear
on screen**: what happens when two people do this at once, who is allowed to
undo it, what the email says, what a returning user sees after six months away.
A question you do not ask here becomes a schema migration in phase 4.

See `references/phase-2-prototypes-and-spec.md`,
`references/exhibition-harness.md`, and `references/harness/` for a working one
to lift.

## Phase 3: the question walk

Take the spec's open questions **one at a time**, in order. Use
`AskUserQuestion` with a recommendation. Record each answer in the spec with
its reasoning, because the close calls get reopened by whoever does not know
why they went that way.

Then build what the answers imply: new states, new surfaces, changed copy.
Report what changed in the spec and what was added to the prototypes, and get
explicit approval before phase 4.

See `references/phase-3-question-walk.md`.

## Phase 4: the data model

**Dispatch subagents.** Every surface and state has to be read, and one agent
reading all of them will run out of context before it runs out of surfaces.

Slice by surface cluster, not by table: a per-table slice produces five agents
each inventing the same entity. Then merge their reports yourself, resolving
duplicates and contradictions into one schema.

Write `<specdir>/data-model.md`, ending with numbered open questions. Walk
those with the user exactly as in phase 3.

See `references/phase-4-data-model.md`.

## Phase 5: the API contract

**Dispatch subagents again, and write the conventions file first.** Eight
documents written in parallel merge into one contract only if they were written
against one set of rules: paths, envelope, pagination, error shape, the frozen
shared types, the auth context. Without it you get eight dialects.

Slice by domain (route group), which lines up with how route modules are
organised anyway. Merge in dependency order, apply pre-agreed tie-breaks for
the collisions you predicted, and verify the invariants by grep rather than by
trust.

Write `<specdir>/api.md` as the index and master route table, with one file per
slice beside it.

See `references/phase-5-api-contract.md`.

## Phase 6: the build plan

Turn everything into an ordered, mostly parallelisable set of steps. Numbered
steps are sequential; **letters mean parallel** (2a, 2b, 2c can run at once).

Each step is one reviewable milestone and one complete
brainstorm → spec → plan → implement cycle for whoever picks it up.

**The plan is read in a session where this skill is not loaded.** Write every
step to stand alone, in superpowers nomenclature, with paths to the spec and
the API contract it needs. Output is `<specdir>/plan/step-1.md` through
`step-N.md` plus `<specdir>/plan/README.md` explaining how to execute them.

See `references/phase-6-build-plan.md` and the templates beside it.

## Common Mistakes

| Mistake                                                | What it costs                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| Treating phase 2 as visual only                        | The spec ships incomplete and phase 4 invents requirements          |
| Using the repo's UI library in phase 1                 | Slow, and the look gets decided by what the library does by default |
| Skipping the conventions file in phase 5               | Eight parallel documents that contradict each other                 |
| Slicing subagents by table                             | Every agent redefines the same entity                               |
| Writing the phase 6 plan assuming this skill is loaded | The executing agent has no idea what "phase 5" means                |
| Answering the open questions yourself                  | The close calls are exactly the ones the user has opinions about    |
| Shipping a state you have not looked at                | Type-checking cannot see a switch that renders "on" in both states  |

## Reference Files

| File                                                              | When                                                  |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| `references/phase-1-design-language.md` … `phase-6-build-plan.md` | One per phase                                         |
| `references/exhibition-harness.md`                                | Before building the second surface                    |
| `references/harness/`                                             | A working harness to lift, with porting notes         |
| `references/step-template.md`                                     | Writing each phase 6 step                             |
| `references/plan-readme-template.md`                              | Writing the phase 6 README                            |
| `references/worked-example.md`                                    | Calibrating scale, and the mistakes that became rules |
