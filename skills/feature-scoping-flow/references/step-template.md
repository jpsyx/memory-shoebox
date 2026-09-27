# Step template

Copy per step into `<specdir>/plan/step-N.md`. Replace everything in angle
brackets. Delete nothing: each section exists because its absence caused a
problem.

---

```markdown
# Step <N>: <Name>

**Status:** not started
**Parallel with:** <step ids, or "nothing: this step is sequential">
**Depends on:** <step ids that must be complete, or "nothing">

## What this step delivers

<Two or three sentences. A reviewable milestone somebody can demonstrate, not a
list of files.>

**Done when:** <the observable condition. A command that passes, a flow that
works end to end.>

## How to execute this step

You are implementing **only this step**. Other steps are listed at the foot of
this file; they are not yours and several are deliberately not designed yet.

**Two different documents are called a spec here, so they are named apart
throughout.** The **product spec** is `PRD.md` and `design-spec.md` in the
PRD directory: they
already exists, it covers the whole product, and you only read it. Your **step
design** is what you write for this step alone, under
`docs/superpowers/specs/`. Where an instruction below says one, it never means
the other.

Run the full superpowers cycle, scoped to this step:

1. **`superpowers:brainstorming`.** Read the documents under "Read these first"
   before asking anything. They were written to answer the questions this step
   raises, and most of your questions are already answered there. Ask the user
   only what those documents genuinely do not settle **and** that this step
   needs now. Treat this as architectural scope: it produces a written spec.
2. **Write the step design** at
   `docs/superpowers/specs/YYYY-MM-DD-<step-slug>-design.md`. Base it on the
   product spec and `apis/` rather than restating them: cite the sections, and
   write down only what is specific to this step. You will usually have enough
   to write it without further questions.
3. **`superpowers:writing-plans`** for the detailed implementation plan.
4. **`superpowers:subagent-driven-development`** (or
   `superpowers:executing-plans`) to implement it.

## Read these first

| Document                                   | What you need from it                      |
| ------------------------------------------ | ------------------------------------------ |
| `<path to PRD.md>`                         | <the requirements this step delivers>      |
| `<path to design-spec.md>`                 | <the surfaces, states and flows>           |
| `<path to tech-specs/data-models.md>`      | <the specific tables>                      |
| `<path to tech-specs/apis/conventions.md>` | binding on every route you write           |
| `<path to tech-specs/apis/<slice>.md>`     | <the specific route groups>                |
| `<path to prototypes surface>`             | <the surfaces and states this step builds> |

## Scope

**In:**

- <bullets, specific>

**Out, and owned by a later step:**

- <bullet> (step <N>)

## Interfaces this step produces

<Exact names, signatures, routes or types that later steps will import or call.
Later steps' implementers see only their own file, so this is how they learn
what exists. Omit if nothing.>

## Interfaces this step consumes

<From which earlier step. Exact names. Omit if nothing.>

## Do not ask the user about

These are later steps. If a question about one comes up, note it and move on:

| Topic   | Owned by |
| ------- | -------- |
| <topic> | step <N> |

## Verification

<How a reviewer confirms this step is done: the command to run, the flow to
click through, the states to compare against the prototype.>
```
