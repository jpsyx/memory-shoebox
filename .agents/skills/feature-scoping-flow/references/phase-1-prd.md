# Phase 1: the PRD

The north star. Every later phase is derived from it, and a thin PRD produces
a prototype directory that looks finished and answers the wrong questions.

**Do not rush this.** It is the one phase where the cost of a missed question
compounds through six others.

## What you are usually starting from

The user typed `/feature-scoping-flow we will build <thing>` and nothing else.
Occasionally they paste an essay. Either way, **research before you ask.**

Read, in this order, whichever exist:

| Source                              | What you learn                                         |
| ----------------------------------- | ------------------------------------------------------ |
| `docs/PRODUCT.md`                   | Whether this repo already has a product, and its voice |
| `README.md`, `docs/README.md`       | What the repo claims to be                             |
| `docs/architecture.md`, `AGENTS.md` | The stack, and the constraints you must design inside  |
| `package.json`, the directory tree  | Whether this is empty scaffolding or a live product    |
| Recent `git log`                    | What the team has actually been doing                  |

Three situations, and they want different opening questions:

- **Empty repo.** Everything is open. Ask about the problem first, never the
  features.
- **Live product, new feature.** Most constraints are already decided. Your job
  is to find where this feature touches what exists, and the existing product's
  conventions are answers you do not need to ask for.
- **Live product, whole-repo rescope.** Read `PRODUCT.md` closely. You are
  revising a position, not inventing one, and the user will be annoyed by
  questions their own document answers.

## Then brainstorm

**REQUIRED:** `superpowers:brainstorming`. Classify the work out loud. A whole
product or a feature large enough for this skill is **architectural**, so it
takes the full path: questions one at a time, two or three approaches with a
recommendation, sectioned design, written document, user approval.

Ask one question at a time. A numbered list of eight gets you one answer.

## What the PRD must cover

The four the user always wants, and the ones that get skipped:

| Section                           | What it has to answer                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Problem statement**             | The specific friction somebody feels. Not "there is no X" but what goes wrong today, to whom, how often        |
| **Target audience**               | Who benefits, concretely. Ages, technical confidence, what device they hold, what they already use instead     |
| **User stories and requirements** | High-level capabilities from the user's side. What somebody can do, not what the system has                    |
| **Scope boundaries**              | In scope for this version, and **explicitly out**, with the out-of-scope items named rather than merely absent |

Skipped, and always needed later:

- **The failure that matters most.** Every product has one thing that, if it
  breaks, makes the rest pointless. Name it in phase 1 or discover it in
  phase 6.
- **Who is allowed to do what.** Roles, and what each can see and change. This
  is the single largest source of phase 5 rework when it is left vague.
- **What the product refuses to do**, as principle rather than backlog.
- **Operating context.** Who runs it, who pays, what happens when it is down.

**`PRODUCT.md` in this repository is a worked example of the layout.** Read it
before writing. If it is missing any of the four above, add them to it as part
of this phase: the checklist applies to it too.

## Where it goes

`<specdir>/PRD.md`.

**Whole-repository run:** `PRD.md` is a pointer, and the content lives in
`docs/PRODUCT.md`. Impeccable reads `PRODUCT.md` at that exact path and will
not find it anywhere else, and one product deserves one record rather than two
that drift. So:

```markdown
# <Product> PRD

The product record for this repository is [`docs/PRODUCT.md`](../../PRODUCT.md).

It is the PRD for this scoping run, kept at that path because impeccable reads
it there. Everything else this run produced is in this directory.
```

Then do the actual work in `PRODUCT.md`.

**Feature run:** the content lives in `<specdir>/PRD.md` and `PRODUCT.md` is
not touched.

## Write it so impeccable can use it

Impeccable reads the product record to ground its design work, so the layout
matters as much as the content. Follow `PRODUCT.md`'s own section shape:
Platform, Users, Product Purpose, Positioning, Operating Context, Capabilities
and Constraints, Brand Commitments, Product Principles, Accessibility and
Inclusion, Non-goals.

Those headings carry the four required topics between them. Add sections
rather than renaming these, so `/init` and `/shape` keep finding what they
expect.

## It is a living document

So is everything else this skill produces. When phase 4 settles a question,
when a prototype reveals a missing state, when phase 6 finds a hole: come back
and update the PRD. An artifact that describes the product as it was imagined
rather than as it was decided is worse than no artifact, because people trust
it.

## The gate

The user approves the written PRD before phase 2. Under
`superpowers:brainstorming`'s architectural path this is a hard gate, and it is
the right one: every phase after this is expensive and all of it assumes the
PRD is right.
