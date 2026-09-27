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

## The steps

<Table: number, name, what it delivers, what it runs in parallel with.>

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
