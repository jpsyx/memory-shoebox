# Step 9: The admin area, and retiring the reference

> Historical source references. `reference/` and `@memory-shoebox/reference` below are historical shorthand for the retired surface package at commit `3e09157b`, not current paths or runnable instructions. Read that commit for the original source spelling. Product decisions remain binding; current implementation and acceptance are documented in `docs/web.md` and step 9 verification.

**Status:** implementation delivered and reference package retired; automated verification passed. One confirmed Settings review finding and the documented retirement/accessibility gates remain open.
See [step-9-verification.md](step-9-verification.md) for current results.
**Parallel with:** nothing: this step is sequential
**Depends on:** steps 8a and 8b

## What this step delivers

The last five surfaces, all admin, and then the thing that says the build is
finished: `reference/` is deleted. Shoebox settings, members, groups, who has
been looking, and what has been changed. Plus the final pass over everything,
because this is the first session in which all eighteen surfaces exist at once.

**Done when:** an admin can run the Shoebox entirely from the application, with
no route left pointing at a placeholder; `reference/` is gone and `pnpm check`
is green without it; and every surface has been looked at side by side against
what it was drawn as, before that reference disappears.

## How to execute this step

You are implementing **only this step**. This is the last step, so nothing is
out of scope for being somebody else's, but plenty is out of scope for being a
new idea rather than a specified one.

**Two different documents are called a spec here, so they are named apart
throughout.** The **product spec** is `docs/PRODUCT.md` and
`docs/prds/2026-09-27-memory-shoebox/design-spec.md`: they already exist, they
cover the whole product, and you only read them. Your **step design** is what
you write for this step alone, under `docs/superpowers/specs/`.

Run the full superpowers cycle, scoped to this step:

1. **`superpowers:brainstorming`.** Read the documents under "Read these first"
   and **run the reference one last time**. Ask the user only what they
   genuinely do not settle.
2. **Write the step design** at
   `docs/superpowers/specs/YYYY-MM-DD-admin-area-design.md`.
3. **`superpowers:writing-plans`** for the detailed implementation plan.
4. **`superpowers:subagent-driven-development`** to implement it.

## Read these first

| Document                                                                     | What you need from it                                                                                       |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `docs/prds/2026-09-27-memory-shoebox/design-spec.md`                         | Surfaces 11, 12, 13, 17 and 18, every state, and the "Running the Shoebox" flow including where it fails    |
| `reference/` surfaces `settings`, `members`, `groups`, `presence`, `changes` | Every state, and this is the last chance to look at any of them                                             |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/administration.md`      | Every route these surfaces call                                                                             |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/notifications.md`       | Part 2: presence, item viewers, activity, mail health                                                       |
| `docs/PRODUCT.md`                                                            | § How it works, in full. § Accessibility & Inclusion, which is the bar for the final pass                   |
| `docs/reference.md`                                                          | What the reference were for and the conditions under which they go                                          |
| `AGENTS.md`                                                                  | Nothing in `apps/` may import from `reference/`, which is what makes deleting it a check rather than a hope |

## Scope

**In:**

- Surface 11: the Shoebox's name and the pile arrangement, both deployment-wide
  rather than per person, plus the mail diagnosis when mail is failing
- Surface 12: the member list with roles, invite by email with the name
  pre-filled from a suggestion, invitation pending, resend or revoke, change a
  role, remove a member, revoke any device, and **the last admin**, which
  refuses to leave the Shoebox without one
- Surface 13: the group list, create, rename, add and remove members, and
  deleting a group that visibility rules still reference, which must state what
  that does **in both directions**, because removing a group from an `except`
  rule widens access rather than narrowing it
- Surface 17: a row per member ordered by who is most present, who has opened
  one photograph, a member who has never signed in, and the plain statement of
  what is deliberately not recorded
- Surface 18: the change log grouped by day, the family filter, filtered to one
  person, one photograph that has since been deleted, and a Shoebox where
  nothing has been changed yet
- **Deleting `reference/`**: the directory, its workspace entry in
  `pnpm-workspace.yaml`, the `dev:reference` script, its line in the
  Dockerfile and `.dockerignore`, and every reference to it in `docs/`,
  `AGENTS.md` and `README.md`. `docs/reference.md` goes with it
- A final pass over all eighteen surfaces: keyboard, screen reader, 200% zoom,
  both colour schemes, three breakpoints. This is the first session in which
  they all exist, and the last in which the reference does

**Out:**

- Any new feature. Everything here is drawn; if something is missing from the
  drawings, say so rather than inventing it
- Any change to `apps/server`, which step 8a finished

## Interfaces this step produces

A finished application.

## Interfaces this step consumes

From step 8a: the administration slice and notifications Part 2.
From step 3b: the theme, the system components, `apiFetch`, the router.

## Handed over from step 4b

**Member addresses are already in the access log, and nothing in this product
governs that copy.** Surface 1 keeps its state in the URL (sign-in design,
decision 1), so `GET /sign-in?email=abuela@example.com` lands in Fastify's
access log, in browser history, and in any screenshot somebody shares. That
follows from that decision and from invitation links already carrying the
address as a plain query parameter, so it is consistent rather than new and
step 4b changed nothing about it.

It is recorded here because this step is where it matters. "Who has been
looking" and the change log are the product's own account of who saw what,
with a retention story and an admin who can read it. The access log is a
second account of roughly the same thing, holding addresses, that none of
those surfaces shows, bounds or retires. Whoever builds them should decide
deliberately whether that is fine rather than discover it.

## Do not ask the user about

Nothing is a later step's any more. Two things are still out of scope, and both
for the same reason:

| Topic                                              | Why not                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Anything in `PRODUCT.md` § Non-goals               | They are choices, and pull requests that add them will be declined                      |
| A surface, state or field nobody drew or specified | Eighteen surfaces and 108 states were designed on purpose. Report a gap; do not fill it |

## Verification

- `pnpm check` green **after** `reference/` is deleted, which is the check
  that nothing in `apps/` was importing from it
- Every state of all five surfaces compared against its prototype URL, at three
  breakpoints and in both colour schemes, **before** the deletion
- The whole "Running the Shoebox" flow by hand, including `last-admin` and
  `delete-used`
- A test that the last admin cannot be demoted or removed from the interface
  either, not only from the route
- A keyboard and screen-reader pass over all eighteen surfaces
- 200% zoom across all eighteen with no horizontal scrolling and nothing clipped
- A grep proving no reference to `reference` survives in `apps/`, `docs/`,
  `AGENTS.md`, `README.md`, `Dockerfile`, `.dockerignore`,
  `pnpm-workspace.yaml` or `package.json`
- `docs/` updated to describe what was built, per `AGENTS.md`: that is part of
  the definition of done, not an afterthought
