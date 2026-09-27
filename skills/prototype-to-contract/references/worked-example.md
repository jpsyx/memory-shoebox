# Worked example: the reference run

The run this skill was written from, for scale calibration. A self-hosted
private photo archive for one family, taken from nothing to a buildable
contract.

| Phase | Output                                 | Size                                                          |
| ----- | -------------------------------------- | ------------------------------------------------------------- |
| 1     | `DESIGN.md` from 5 plain-HTML surfaces | 4 palettes, one token file                                    |
| 2     | `prototypes/` plus the spec            | 16 surfaces, 95 states, 15 open questions                     |
| 3     | The question walk                      | 17 decisions (15 + 2 added mid-walk), 17 surfaces, 108 states |
| 4     | `data-model.md`                        | ~30 tables, 6 parallel read-only agents                       |
| 5     | `api.md` and 8 slice files             | 77 routes, 9 documents, 1 planning agent + 8 writers          |
| 6     | `plan/`                                | not yet run                                                   |

## What each phase actually cost

Phase 2 was by far the largest and produced the most rework, which is correct:
rework in a prototype is cheap and the same discovery in phase 5 is not.

Phase 3 added a whole surface. One decision ("an admin wants to know who is
actually looking") had no surface answering it, and the walk surfaced that.

Phases 4 and 5 each found bugs in the work before them, because both read every
surface more carefully than anybody had since building them.

## Things that went wrong, and are now rules in this skill

- **A generic `.gitignore` rule swallowed the fixtures.** `data/` matched
  `prototypes/src/data/`, so the branch did not build from a fresh clone and
  nobody noticed for days. Now: anchor the rule, verify with a real clone.
- **A CSS attribute selector matched both states.** `[data-checked]` matches
  `data-checked="false"`, so a switch rendered as "on" in both states from the
  day it was styled. Type-checking cannot catch this. Now: look at every state
  in a browser.
- **A decision made existing copy false.** Removing the code from an invitation
  turned a banner that described it into a lie. Now: after each decision, look
  for copy that is newly wrong, not merely improvable.
- **The formatter corrupted the docs.** `snake_case` in prose became
  `snake*case`, because a Markdown formatter read the underscores as emphasis.
  Now: put such tokens in code spans.
- **The API agents found a security hole created two phases earlier.** A
  decision to drop the invitation token had made the account row the only thing
  granting access, while the invitation row was still the only thing closing
  it, so a revoked or expired invitation left a signable account. Nothing
  caught it until somebody had to write the route. Now: expect phase 5 to find
  schema holes, and fix them in the schema.

## Calibration

If a phase comes out far smaller than the table above, the likely cause is not
that the product is simpler. It is that the states were not enumerated. Count
the states before believing the estimate.
