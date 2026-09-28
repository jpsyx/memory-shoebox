# Plan README template

Copy into `<specdir>/plan/README.md`. This is the first thing anybody reads,
including an agent in a session that has none of the design context.

---

```markdown
# <Product or feature> implementation plan

<One paragraph: what is being built, and that the design work is finished. Name
the three documents that hold it.>

## The documents behind this plan

| Document                           | What it is                                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `<path>/PRD.md`                    | The **product requirements**: the problem, who it is for, what it must do, and what is out of scope |
| `<path>/design-spec.md`            | Every surface, every state, the user flows, and the decisions with their reasoning                  |
| `<path>/tech-specs/data-models.md` | The schema: tables, keys, cascades, and what is deliberately not stored                             |
| `<path>/tech-specs/apis/`          | Every route and its types, one file per group, with `conventions.md` binding all of them            |
| `prototypes/`                      | Running mockups of every surface and state                                                          |

Read the conventions file in the API contract before writing any route. The
things most easily got wrong are settled there rather than per route.

## How to execute this plan

**One step per session.** Each step is a complete
brainstorm → spec → plan → implement cycle and ends at a reviewable milestone.
Do not run several steps in one session: the point of the split is that each
gets a fresh context and its own review.

In a new session:

> Use superpowers to execute step <N> in `<path>/plan/step-<N>.md`

The agent should then:

1. Read that step file and the documents it names
2. Run `superpowers:brainstorming`, scoped to that step only, asking the user
   only what the documents do not answer
3. Write a **step design** for that step under `docs/superpowers/specs/`,
   which is a different document from the `PRD.md` and `design-spec.md` it
   reads
4. Run `superpowers:writing-plans` for the detailed implementation plan
5. Implement with `superpowers:subagent-driven-development`

**Steps are not detailed implementation plans.** They are scoped milestones.
The detailed plan is written in the session that implements them, by an agent
that has just read the relevant spec sections.

## Where this is up to

<Which steps are done, and which are next. One short paragraph, kept current.>

**This section and the Status column below are the record.** Each step file
carries its own `**Status:**` line; this file repeats it so there is one place
to open first. Whoever executes a step updates both, in the same change that
merges the step. A plan whose statuses are stale is not a plan, it is an
archaeology exercise: the next session cannot tell what is built from what was
merely designed, and the honest way to find out is to read the code.

### Work that is not a numbered step

<Anything built outside this plan, and what it changed. Omit while empty.>

Real builds grow work the plan did not foresee: a step turns out to need
something no step owns, or a dependency forces a detour. Record it here rather
than nowhere. Name what was built, where its documentation is, and anything it
left unfinished that a later step will inherit. This is the section that stops
the next session rediscovering it by accident.

## The steps

<Table: number, name, what it delivers, what it runs in parallel with, status.>

Status is one of `not started`, `in progress`, `blocked: <on what>`, `done`,
and matches the step file.

## Parallelism

Numbered steps are sequential. **Letters mean parallel**: <2a> and <2b> can be
run at the same time in separate sessions, on separate branches.

<One line per parallel group saying why those steps do not collide: different
files, different tables, or one is frontend and one is backend against an
agreed contract.>

## Worktrees

Run each step in its own worktree, per `superpowers:using-git-worktrees`. For
parallel steps this is required rather than advisable.
```
