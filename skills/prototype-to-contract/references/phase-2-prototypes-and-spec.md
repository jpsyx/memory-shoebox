# Phase 2: every surface, every state, and a complete spec

The largest phase. Two outputs of equal weight:

1. High-fidelity mockups of every surface in every state, in `prototypes/`
2. A complete functional spec, ending in numbered open questions

The second is the one that gets dropped, because the first is visible and fun.
Guard against that: a beautiful prototype directory with a thin spec has
carried none of the thinking into phase 4, where it is needed.

## Set up the directory properly

`prototypes/` is a real workspace member with its own `package.json`, not a
folder of loose files. It must build and lint in CI like everything else, or it
rots within a week.

Make sure it is excluded from anything that would try to deploy it, and that
nothing in the real app can import from it. Say so in its README and in the
repo's agent rules.

**Check the repo's ignore files before committing.** A generic `data/` rule in
`.gitignore` will silently swallow `prototypes/src/data/`, and you will not
notice until somebody clones the branch and it does not build. Anchor such
rules (`/data/`) and verify with a real clone into a temp directory.

## Use the repo's UI libraries

This is the phase where the design language becomes a design system in the
tools the product ships with. If the repo uses Mantine, that means:

- A real theme, with `createTheme`, `cssVariablesResolver` and a
  `variantColorResolver`, not inline styles
- `Component.extend({ classNames })` for adaptations, so a future developer
  gets the adaptation by using the component
- Tokens in one CSS file, the theme reading from them, and nothing hardcoding a
  colour

The test: a developer should be able to copy the theme file and a component
into the real app and have it work.

**Do not use a full-stack framework.** A router is fine. SSR, a data layer, a
server entry point and an API client are not: they are implementation
decisions this phase has no information to make, and they make the mockups
harder to read.

## Covering the states

Work from the spec's list of states per surface, and treat that list as a
contract. For each surface, the states almost always include more than the
happy path:

- Empty, and the different empty of "there is content but not for you"
- Loading is usually not worth a state; partially loaded sometimes is
- Every failure the surface can produce, with its real copy
- Every permission variant, because a viewer and an admin are different designs
- The state after each action completes, which is where "and then what?" gets
  answered

Register each one with a note saying why it exists. If you cannot write the
note, the state is probably not real.

## Brainstorm for function, not just for looks

Run `superpowers:brainstorming` alongside the design work, and push it past
what is visible. The questions that pay off in phase 4 are mostly invisible
ones:

- Who is allowed to undo this, and for how long?
- What happens when two people do it at once?
- What does the email say, and what does it say to somebody who can only see
  part of what it is about?
- What does a returning user see after six months? After a year?
- What is deliberately not recorded, and can the product say so out loud?
- When this is deleted, what goes with it and what survives?
- What does the admin see that nobody else does, and why is that defensible?

Every one of those becomes a column, a cascade rule or a route later.

## The spec

Whole product: `docs/PRODUCT.md`.
One feature: `docs/specs/YYYY-MM-DD-<feature-name>/spec.md`.

It must carry, at minimum: the nomenclature table, the roles and what each can
do, the visibility or permission model, the surfaces with their states, what is
explicitly out of scope, and the numbered open questions.

**Write the open questions as you go.** Every time you make a call that could
reasonably have gone the other way, add it. A phase 2 that ends with two open
questions was not interrogated hard enough; the reference run ended with
fifteen and all fifteen were worth asking.

## Review in a browser

Do not ship a state you have not looked at. Screenshot the ones you changed and
read them: layout defects that are obvious on screen are invisible in JSX, and
in the reference run several real bugs (a switch rendering as "on" in both
states, an icon overlapping a placeholder, a chip contradicting its own count)
survived a type-check and were only caught by looking.
