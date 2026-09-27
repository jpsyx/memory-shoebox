---
name: feature-scoping-flow
description: Use when taking a product or a large feature from nothing to a buildable plan, when a repo has surfaces to design before any schema or API exists, or when asked to go from mockups to data model to API contract to an implementation plan
---

# Feature Scoping Flow

Seven phases that turn an idea into a plan another agent can build from, by
agreeing what the thing is, designing every surface of it, and deriving the
schema, the API and the build order from what those surfaces turned out to
need.

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

| #   | Phase             | Output                                           |
| --- | ----------------- | ------------------------------------------------ |
| 1   | The PRD           | `PRD.md`, the north star                         |
| 2   | Design language   | `DESIGN.md`                                      |
| 3   | Prototypes        | `prototypes/`, `design-spec.md`                  |
| 4   | The question walk | Settled documents, rebuilt prototypes, approval  |
| 5   | Data models       | `tech-specs/data-models.md`                      |
| 6   | API contract      | `tech-specs/apis/`                               |
| 7   | Build plan        | `plan/step-1.md` … `step-N.md`, `plan/README.md` |

Phases 1 to 4 are collaborative and each ends at a human gate. Phases 5 to 7
fan out to subagents and end with you merging their work.

**Everything here is a living document.** When phase 4 settles a question, when
a prototype reveals a missing state, when phase 6 finds a hole in the schema:
go back and update whatever it contradicts. An artifact describing the product
as it was imagined rather than as it was decided is worse than none, because
people trust it.

**Where things go.** Everything this skill produces lives in one directory:

```
docs/prds/YYYY-MM-DD-<name>/
  PRD.md               phase 1, and living from then on
  design-spec.md       phase 3
  tech-specs/
    README.md          phase 5
    data-models.md     phase 5
    apis/              phase 6
      README.md
      conventions.md
      <slice>.md
  plan/                phase 7
    README.md
    step-1.md …
```

This skill writes that directory as `<specdir>/`.

**The name**, decided at the start of phase 1 and said out loud:

- **A feature:** the feature's name, kebab-cased.
- **The whole repository:** the **product name from `PRODUCT.md`**, kebab-cased
  (`memory-shoebox`). A whole-product run is not a special case that escapes
  the directory; it is the case where the thing being specified happens to be
  everything.

The date is the day the run starts, and does not change when later phases run.

**`PRD.md` always exists at `<specdir>/PRD.md`.** Where its _content_ lives
depends on the run:

- **Whole-repository run:** the content is `docs/PRODUCT.md`, and `PRD.md` is a
  three-line pointer to it. Impeccable reads `PRODUCT.md` at that exact path
  and will not find it anywhere else, and one product deserves one record
  rather than two that drift. Write `PRODUCT.md` first if it does not exist:
  this skill takes its directory name from it.
- **Feature run:** the content is `<specdir>/PRD.md`, and `PRODUCT.md` is not
  yours to touch. Nothing about one feature belongs in the repository's
  standing product record.

## Phase 1: the PRD

The north star. Every later phase derives from it, and a thin PRD produces a
prototype directory that looks finished and answers the wrong questions.

**Research before you ask.** The user probably typed
`/feature-scoping-flow we will build <thing>` and nothing else. Read
`PRODUCT.md`, the READMEs, `AGENTS.md`, the tree and recent commits first, so
you can tell which of three situations you are in: an empty repo where
everything is open, a live product gaining a feature where most constraints are
already decided, or a live product being rescoped where the user will be
annoyed by questions their own document answers.

**Then brainstorm properly.** `superpowers:brainstorming`, architectural path,
one question at a time. Do not rush it: this is the one phase where a missed
question compounds through six others.

The PRD must cover the **problem** somebody actually feels, the **audience**
concretely, **user stories** from their side, and **scope boundaries** with the
out-of-scope items named rather than merely absent. Plus the ones that always
get skipped and are always needed later: the one failure that makes the rest
pointless, and **who is allowed to do what**, which is the largest single
source of phase 6 rework when left vague.

**Write it so impeccable can read it.** Follow `PRODUCT.md`'s section layout in
this repo, which is what `/init` produces and what `/shape` expects. Add
sections rather than renaming those.

See `references/phase-1-prd.md`.

## Phase 2: settle the look

Skip entirely if `DESIGN.md` exists.

Pick the 3 to 5 surfaces that carry the most of the product's character and
prototype them with impeccable (`/shape`, then the usual impeccable loop).
**Plain HTML and CSS. No framework, no repo UI library, no build step.** The
question in this phase is what the thing looks like, and a framework only slows
that down.

Then `/document` writes `DESIGN.md`. That file is the normative visual record
from here on.

See `references/phase-1-design-language.md`.

## Phase 3: every surface, every state, and the design spec

Three outputs, and the ones that are not pictures are the ones that get
forgotten:

1. High-fidelity mockups of **every surface in every state** in `prototypes/`.
2. **`<specdir>/design-spec.md`**: the surfaces, the user flows between them
   including the ones that fail, interactive states, responsive behaviour and
   accessibility. Anything already in `DESIGN.md` is **referenced, never
   restated**, as `See DESIGN.md § <heading>`.
3. An updated **`PRD.md`** and **`DESIGN.md`**. Designing every state teaches
   you things phase 1 could not know, and both are living documents.

`design-spec.md` also ends with the **numbered open questions** phase 4 walks.

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
A question you do not ask here becomes a schema migration in phase 5.

See `references/phase-3-prototypes-and-design-spec.md`,
`references/design-spec-template.md`, `references/exhibition-harness.md`, and
`references/harness/` for a working one to lift.

## Phase 4: the question walk

Take the open questions **one at a time**, in order. Use `AskUserQuestion`
with a recommendation. Record each answer with its reasoning, because the close
calls get reopened by whoever does not know why they went that way.

Then build what the answers imply: new states, new surfaces, changed copy.
Answers land in whichever document they belong to, which is usually more than
one: a decision about who may do what is a `PRD.md` change and a prototype
change at the same time.

Report what changed and where, and get explicit approval before phase 5.

See `references/phase-4-question-walk.md`.

## Phase 5: the data models

**Dispatch subagents.** Every surface and state has to be read, and one agent
reading all of them will run out of context before it runs out of surfaces.

Slice by surface cluster, not by table: a per-table slice produces five agents
each inventing the same entity. Then merge their reports yourself, resolving
duplicates and contradictions into one schema.

Write it to **`<specdir>/tech-specs/data-models.md`**, ending with numbered
open questions. Walk those with the user exactly as in phase 4.

Create `<specdir>/tech-specs/README.md` in the same phase, from
`references/tech-specs-readme-template.md`. It is a signpost for whoever
arrives at the directory without having read this skill.

See `references/phase-5-data-models.md`.

## Phase 6: the API contract

**Dispatch subagents again, and write the conventions file first.** Eight
documents written in parallel merge into one contract only if they were written
against one set of rules: paths, envelope, pagination, error shape, the frozen
shared types, the auth context. Without it you get eight dialects.

Slice by domain (route group), which lines up with how route modules are
organised anyway. Merge in dependency order, apply pre-agreed tie-breaks for
the collisions you predicted, and verify the invariants by grep rather than by
trust.

**The output is a directory, never one file.** `<specdir>/tech-specs/apis/`
holds `conventions.md` (written first, binding on the rest), one file per
slice, and `README.md` as the index and master route table. A single file
cannot be written by eight agents at once, and nobody reads nine thousand lines
of routes top to bottom anyway.

**Finish with a conventions pass.** Dispatch one last subagent to read
`docs/rules/` and bring every code snippet in the written markdown into line
with this repository's own conventions. The slice agents were concentrating on
correctness, not house style, and nobody told them the rules.

See `references/phase-5-api-contract.md`,
`references/api-conventions-template.md` and
`references/api-readme-template.md`.

## Phase 7: the build plan

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

| Mistake                                                | What it costs                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Rushing phase 1 to get to the drawing                  | Six phases derive from the PRD and all of them inherit its gaps                                         |
| Treating phase 3 as visual only                        | The design spec ships thin and phase 5 invents requirements                                             |
| Using the repo's UI library in phase 2                 | Slow, and the look gets decided by what the library does by default                                     |
| Restating `DESIGN.md` in `design-spec.md`              | Two copies of a token scale is one copy and one lie, and this is the stale one                          |
| Answering the open questions yourself                  | The close calls are exactly the ones the user has opinions about                                        |
| Letting an artifact go stale after its phase           | Everything here is living; a document describing what was imagined is trusted and wrong                 |
| Slicing subagents by table                             | Every agent redefines the same entity                                                                   |
| Skipping the conventions file in phase 6               | Parallel documents that contradict each other                                                           |
| Skipping the phase 6 rules pass                        | A contract in a house style the repo does not use, copied into the code by everybody who builds from it |
| Shipping a state you have not looked at                | Type-checking cannot see a switch that renders "on" in both states                                      |
| Writing the phase 7 plan assuming this skill is loaded | The executing agent has no idea what "phase 6" means                                                    |

## Reference Files

| File                                                  | When                                                     |
| ----------------------------------------------------- | -------------------------------------------------------- |
| `references/phase-1-prd.md` … `phase-7-build-plan.md` | One per phase                                            |
| `references/design-spec-template.md`                  | Writing phase 3's design spec                            |
| `references/exhibition-harness.md`                    | Before building the second surface                       |
| `references/harness/`                                 | A working harness to lift, with porting notes            |
| `references/tech-specs-readme-template.md`            | The phase 5 signpost                                     |
| `references/api-conventions-template.md`              | Writing the phase 6 conventions file, before dispatching |
| `references/api-readme-template.md`                   | Writing the phase 6 index after the merge                |
| `references/step-template.md`                         | Writing each phase 7 step                                |
| `references/plan-readme-template.md`                  | Writing the phase 7 README                               |
| `references/worked-example.md`                        | Calibrating scale, and the mistakes that became rules    |
