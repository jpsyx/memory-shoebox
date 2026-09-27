# Phase 6: the build plan

A high-level implementation order. **Not a detailed implementation plan**: each
step gets its own detailed plan later, written by whoever executes it.

## The shape

Numbered steps are **sequential**. Letters mean **parallel**: 2a, 2b and 2c can
run at the same time, in separate sessions, by separate people or agents.

```
Step 1    Foundations
Step 2a   Backend: auth      Step 2b   Backend: archive reads
Step 3a   Backend: uploads   Step 3b   Frontend: shell and theme
```

Split backend and frontend wherever it buys parallelism. The API contract from
phase 5 is what makes that safe: both halves build against it, so the frontend
does not wait for the backend to exist.

## Sizing a step

One step is **one reviewable milestone** and one complete
brainstorm → spec → plan → implement cycle. Rules of thumb:

- A step someone can demonstrate. "Auth works end to end", not "add a column"
- A step that could be rejected in review without invalidating its neighbours
- If a step has no sensible test, it is not a step
- Ten to fifteen steps for a product; three to six for a feature

## Ordering

- Foundations first, and only genuine foundations: migrations, config, the
  shared types. Anything that everything else imports
- Then backend by domain, parallel wherever two domains do not share tables
- Frontend shell early, because it unblocks every other frontend step
- The riskiest step early enough that discovering it was wrong is survivable
- Anything touching permissions or visibility gets its own step, never folded
  into a feature step

## Output

`<specdir>/plan/step-1.md` … `step-N.md`, plus `<specdir>/plan/README.md`.

One file per step. A single large file gets skimmed, and the executor reads
only their own step anyway.

## The constraint that shapes everything here

**The plan is read in a fresh session where this skill is not loaded.** The
only skills present will be the superpowers suite. So each step file must:

- Never reference "phase 5" or this skill, or any context from this session
- Carry **paths** to the spec, the data model and the API contract directory,
  with the specific sections and slice files that matter, because the reader
  has not read them
- Use superpowers nomenclature, so the executing agent recognises what it is
  being asked to do
- Tell the reader to run brainstorm → spec → plan **for that step only**, not
  for the whole product
- Tell the brainstorm to read `spec.md` and the relevant files under `apis/`
  first, and only ask the
  user what those genuinely do not answer
- **Tell the brainstorm not to ask about later steps.** This is the failure
  mode worth guarding hardest: an agent handed step 2 will happily interrogate
  the user about step 7, wasting a session on decisions already made or not yet
  due. List the later steps by name in each step file so the agent can
  recognise an out-of-scope question and decline it

Use `step-template.md` and `plan-readme-template.md` in this directory.

## Before you finish

Check every step file opens without the reader needing anything you have not
handed them. The cheapest test: read one step file top to bottom and ask
whether somebody who has never seen this repo could start.
