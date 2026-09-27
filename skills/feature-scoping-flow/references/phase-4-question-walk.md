# Phase 4: the question walk

The spec ends phase 3 with numbered open questions. Walk them **one at a time,
in order**, and do not batch them into a single message. Batching produces one
answer to the easiest question and silence on the rest.

## Asking

Use `AskUserQuestion`. For each question:

- State what is actually at stake, in one or two sentences
- Offer two to four real options, each with its consequence
- **Put your recommendation first and label it.** You have read every surface;
  an unqualified menu wastes that

Expect to be overruled on some, and expect those to be the interesting ones. In
the reference run the user reversed a recommendation on comment editing, and
the reversal was right: the recommendation had optimised for schema simplicity
over what a family would actually want.

## Recording

Replace the Open Questions section with a **Decisions** section. Each decision
gets its number, the answer, and the reasoning. Then fold the consequence into
the part of the spec it actually changes, so a reader of the table spec sees it
without reading the decision log.

Record the reasoning even when the answer seems obvious in hindsight. The close
calls are the ones somebody reopens in three months, and the log is what stops
that costing a day.

## Mid-walk additions

The user will add requirements during the walk, because working through one
question surfaces another. Take them, number them into the same list, and treat
them identically. In the reference run two of the seventeen recorded decisions
arrived this way, and one of them added a whole surface.

## Then build what the answers imply

The answers are not free. Expect them to produce:

- New states on existing surfaces
- Occasionally a whole new surface
- Copy changes, including copy that is now **wrong** rather than merely
  improvable. In the reference run one decision made an existing banner state
  something false, which is worse than leaving it alone

Work through them, check each in a browser, and keep the spec and the
prototypes in step.

## Report and gate

Say plainly what changed:

- Which decisions changed the spec, in a table
- Which surfaces gained states, and which are new
- What is now wrong elsewhere and has been fixed

Then get explicit approval before phase 5. Phase 5 reads every surface, so
starting it against an unapproved prototype directory wastes the whole fan-out.
