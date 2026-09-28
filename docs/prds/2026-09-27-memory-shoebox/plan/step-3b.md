# Step 3b: The shell and the design system

**Status:** done
**Parallel with:** 3a
**Depends on:** step 1

## What this step delivers

`apps/web` becomes the real application's skeleton: the Mantine theme and every
shared component lifted across from `prototypes/`, the file-based router, the
data layer, and the chrome that every surface sits inside. No product surface
is built here. The next five frontend steps all import from this one, which is
why it comes before any of them.

**Done when:** `pnpm dev:web` serves a themed application whose top bar, panel,
type scale, colours and focus rings are indistinguishable from the prototypes at
1280px and at 400px, in both colour schemes; a route exists for every surface in
the design spec, each rendering a placeholder; and `apiFetch` parses a response
with a shared Zod schema and surfaces an error envelope as a typed failure.

## How to execute this step

You are implementing **only this step**. Other steps are listed at the foot of
this file; they are not yours and several are deliberately not designed yet.

**Two different documents are called a spec here, so they are named apart
throughout.** The **product spec** is `docs/PRODUCT.md` and
`docs/prds/2026-09-27-memory-shoebox/design-spec.md`: they already exist, they
cover the whole product, and you only read them. Your **step design** is what
you write for this step alone, under `docs/superpowers/specs/`.

Run the full superpowers cycle, scoped to this step:

1. **`superpowers:brainstorming`.** Read the documents under "Read these first"
   before asking anything, and **run the prototypes and look at them**. Most of
   what you would ask is visible on screen. Ask the user only what the documents
   and the running mockups genuinely do not settle.
2. **Write the step design** at
   `docs/superpowers/specs/YYYY-MM-DD-web-shell-design.md`.
3. **`superpowers:writing-plans`** for the detailed implementation plan.
4. **`superpowers:subagent-driven-development`** to implement it.

## Read these first

| Document                                                             | What you need from it                                                                                                                           |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `DESIGN.md`                                                          | **The normative visual record.** Colours, typography, layout, shapes, motion. Nothing here is negotiable and nothing is restated elsewhere      |
| `docs/prds/2026-09-27-memory-shoebox/design-spec.md`                 | § Component design tokens, § Interactive states, and the responsive and accessibility sections. The three breakpoints and what changes at each  |
| `prototypes/src/theme/theme.ts`                                      | The Mantine theme: `createTheme`, the `cssVariablesResolver`, the `variantColorResolver`, and `Component.extend({ classNames })` per adaptation |
| `prototypes/src/system/`                                             | Every shared component: `Chrome`, `Pile`, `Chip`, `PeopleField`, `Reactions`, `FilterStrip`, `typography`, `icons`, `system.module.css`         |
| `prototypes/src/styles/`                                             | `tokens.css`, `global.css`, `fonts.css`                                                                                                         |
| `docs/rules/styling.md`, `docs/rules/routing.md`                     | Binding house style for both halves of this step                                                                                                |
| `docs/web.md`, `docs/architecture.md`                                | How `apps/web` is wired, and that there is no SSR, no server entry and no configurable API base URL: it always calls `/api` on its own origin   |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md` | § Errors and § Envelope, so `apiFetch` handles both correctly from the first request                                                            |
| `docs/PRODUCT.md`                                                    | § Accessibility & Inclusion. WCAG 2.2 AA is a floor, not a target, and the reasons are about the audience rather than about compliance          |

## Scope

**In:**

- The Mantine theme moved into `apps/web`, intact. It was built to move
- Every component in `prototypes/src/system/` moved across, with its CSS module
- The design tokens, the fonts and the global stylesheet
- TanStack Router, file-based, with a route per surface in the design spec, each
  rendering a placeholder. Getting the URL shape right now is cheaper than
  moving five surfaces later
- TanStack Query, configured
- `apiFetch`: one origin, parses every response with its shared Zod schema,
  turns an error envelope into a typed failure carrying `error`, `message` and
  `details`, and never shows `message` as primary UI copy
- The application chrome: the sticky opaque top bar in both its shapes, the
  panel, the page widths, the back link
- The signed-out and signed-in shells, and the route guard's shape. The session
  itself is step 3a's
- A dark and light pass over everything moved, at 1280px, 768px and 400px

**Out, and owned by a later step:**

- Every product surface. Placeholders only
- Any fetch against a real route. Step 4b is the first that talks to a server
- Deleting `prototypes/` (step 9). It stays as the reference for five more
  frontend steps, and `AGENTS.md` forbids `apps/` importing from it, so this is
  a copy rather than a move

## Interfaces this step produces

- `apps/web/src/theme/`, the Mantine theme
- `apps/web/src/system/`, every shared component
- `apiFetch` and the TanStack Query client
- The route tree, one entry per surface

## Interfaces this step consumes

From step 1: the frozen DTO schemas and the error envelope type from
`@memory-shoebox/shared`.

## Do not ask the user about

| Topic                                        | Owned by        |
| -------------------------------------------- | --------------- |
| Sign in and my account                       | step 4b         |
| The timeline, filters, the people directory  | step 5b         |
| One photo and one video                      | step 6b         |
| The upload surface                           | step 7b         |
| Milestones, removals                         | step 8b         |
| Members, groups, settings, presence, the log | step 9          |
| Anything in `apps/server`                    | steps 3a onward |

## Verification

- `pnpm check` green
- Side-by-side against `pnpm dev:prototypes` at 1280px, 768px and 400px, in
  both colour schemes. The components were designed in the library the product
  ships with precisely so this is a comparison and not a reinterpretation
- Keyboard-only traversal of the shell: every focusable thing reachable, the
  3px accent ring with 2px offset visible on each, no trap
- 200% zoom with no horizontal scrolling and nothing clipped
  (`PRODUCT.md` § Accessibility & Inclusion)
- A test that `apiFetch` surfaces a `404` envelope and a `429` with
  `details.retryAfterSeconds` as typed failures rather than as thrown strings
- Nothing under `apps/` imports from `prototypes/`. Assert it, do not assume it
