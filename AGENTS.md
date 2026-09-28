# Agent Rules

## Stack

Memory Shoebox is a self-hosted, private photo and video network for one family. Read
[`docs/PRODUCT.md`](docs/PRODUCT.md) for what it is and, just as important,
what it deliberately is not.

The repository is a pnpm workspace with four packages, plus a fifth that is
scaffolding rather than product:

- **`apps/web`** (`@memory-shoebox/web`): a client-side single-page application (SPA)
  built with TypeScript, React, Mantine, and Vite. Routing is **TanStack
  Router** (`@tanstack/react-router`), file-based. We do **not** use TanStack
  Start: there is no server-side rendering and no server entry point in the web
  app. Data fetching is TanStack Query.
- **`apps/server`** (`@memory-shoebox/server`): a Fastify 5 API owning a SQLite
  catalog (Kysely over better-sqlite3), with media in a Backblaze B2 bucket.
  Node executes its TypeScript directly, so the server still has no build step
  of its own. It does import one package that has one.
- **`packages/shared`** (`@memory-shoebox/shared`): the Zod schemas and inferred types
  that define the HTTP contract between the two.
- **`packages/emails`** (`@memory-shoebox/emails`): the copy of every message the
  server sends, as react-email templates. **The one package here that
  compiles**, because JSX is not erasable syntax and so cannot live in
  `apps/server`. See [`docs/emails.md`](docs/emails.md).
- **`prototypes`** (`@memory-shoebox/prototypes`): high-fidelity, non-functional
  mockups of every surface in [`docs/prds/2026-09-27-memory-shoebox/design-spec.md`](docs/prds/2026-09-27-memory-shoebox/design-spec.md). No API, no
  database, no upload. It holds the design tokens and the Mantine theme that
  `apps/web` is meant to adopt. See
  [`docs/prototypes.md`](docs/prototypes.md). It is deleted once the real app
  is built, and nothing in `apps/` may import from it.

Memory Shoebox deploys as a **single Fly.io app**: one Fastify process serves `/api`
and the built web app from the same origin, which is why there is no CORS
configuration and no configurable API base URL. We do not use Vercel.

Read [`docs/architecture.md`](docs/architecture.md) before changing anything
that crosses the web/server boundary.

## Documentation

- Use `docs/` for architectural notes, design decisions, functionality
  overviews, and checklists (for example `docs/<topic>.md`). These docs exist
  so future humans and LLMs can learn the codebase quickly without having to
  read all of the source.
- **Keep the docs current as you build. This is a rule, not a suggestion.**
  Whenever you add, change, or remove a feature, module, route, data model, or
  architectural boundary, create or update the relevant file(s) in `docs/` as
  part of the same change. Treat updating the docs as part of the definition of
  done, not an afterthought.
  - New capability or subsystem: add or extend the `docs/` file that covers it.
  - Changed behavior, API, schema, or architecture: update the affected doc so
    it reflects reality. Do not leave stale descriptions behind.
  - Removed feature: delete or revise the parts of `docs/` that described it.
- Write docs at a high level: what a module or feature does, how the pieces fit
  together, and why the key decisions were made. Do not restate the code
  line by line.
- Before writing code, read the relevant files in `docs/` first (see
  "Implementation approaches").
- If Context7 MCP is configured, use it to reference the most up-to-date
  documentation of any library when you need it.

## Scope

- Only implement what is requested. Do not fix other bugs, clean up any other
  code, or do any refactors outside of what you were specifically asked to do.
- Only modify the files or directories that you are told to work on.
- If you absolutely must make modifications outside of the scope of
  files/directories you were told, then output a list of the files you changed
  that were outside of the requested scope of files. Include a 1-sentence
  explanation for each file about what changed.

## Implementation approaches

Before writing code:

- Determine which files in `docs/` are relevant to read.
- Determine which available skills are relevant. Run
  `pnpm skills` to see what this project has installed.
- Determine which tests, if any, need to be written to test the requested
  functionality.

**Implement functionality using red/green TDD by default:**

1. **Red**: write a failing test that describes the desired behavior, and run
   it to confirm it fails for the expected reason before writing any
   implementation.
2. **Green**: write the minimum implementation needed to make the test pass,
   and run the test to confirm it passes.
3. **Refactor**: clean up the implementation while keeping the tests green.

As a rule, do not write implementation code before there is a failing test for
it. You may skip TDD only when writing a test adds no real value, for example:

- The change is trivial (e.g. copy tweaks, styling, renaming, config).
- The only test you could write would be redundant with existing coverage.
- The test would be tautological, asserting the implementation restates itself
  (e.g. simply checking that a variable is set, or that a hardcoded variable
  actually has the value we wrote).

When in doubt, write the test.

## Build, test, lint

Run these from the repository root. They fan out across the workspace.

```sh
pnpm install     # install dependencies, plus any missing agent skill
pnpm dev         # run the web app (:5173) and the API (:8080) together
pnpm dev:web     # just the web app
pnpm dev:server  # just the API
pnpm dev:prototypes # just the surface mockups (:5174)
pnpm build       # build the web app
pnpm start       # run the API in production mode, serving the built web app
pnpm migrate     # apply pending database migrations
pnpm type-check  # type-check every package
pnpm test        # run the test suite with vitest
pnpm lint        # lint with oxlint
pnpm format      # format with oxfmt
pnpm check       # format, lint, types, build, and tests: run before pushing
```

Target one package with `pnpm --filter @memory-shoebox/server test` and similar.

The API server needs `apps/server/.env.local` to start. Copy it from
`apps/server/.env.example`; [`docs/configuration.md`](docs/configuration.md)
explains every variable.

## General Code Style & Formatting

## Comments

- Do not use em dashes (—). Prefer a colon for explanations, or a hyphen (-)
  as a short dash for aside explanations where you would have used an em dash.
- Use block comments or docstrings to document exported or public interfaces,
  constants, objects, functions, and classes.

## Naming conventions

- Follow naming conventions for the language you are using.
- Use descriptive variable names with auxiliary verbs (e.g., isLoading,
  hasError).
- Avoid abbreviated names, such as `val`, use the full word `value`, unless
  this were to cause a naming collision with another variable in scope.
- Avoid vague names like `next`, `prev`, or `n`, that don't say what the
  variable actually actually holds. Always include a noun, such as `nextPage`,
  `prevRow` or `numPeople`.
- **Name a function that turns one value into another so that both the source
  and the target appear in the name, counting the receiver as part of the
  name.** A name that states only one side leaves the reader guessing what
  goes in. Decide first whether the receiver (the module or object the
  function hangs off) _is_ the source, _is_ the target, or is neither, because
  only a receiver that is one of the two supplies a half:

  | Shape                      | Use when                                         |
  | -------------------------- | ------------------------------------------------ |
  | `[Source].to{Target}`      | Receiver is the source, and it converts          |
  | `[Source].get{Target}`     | Receiver is the source, and it looks up          |
  | `[Target].from{Source}`    | Receiver is the target                           |
  | `make{Target}From{Source}` | Free function, returning a new value             |
  | `get{Target}From{Source}`  | Free function, returning a value from the source |

  A method whose receiver names one side takes the missing half from that
  receiver and must not repeat it. A free function has no receiver, so it
  spells out both halves and never uses `to`. A method on a receiver that
  names neither side (`MailUtils`, `DateHelpers`) gets nothing from it either,
  so it spells out both halves exactly as a free function does.

- Use `to` for a conversion, which turns the source into another
  representation of itself (`Dataset.toCsv`), and `get` for a fetch, a filter,
  or a lookup of something already contained in the source
  (`Member.getActiveSessions`).
- **Never name a function `resolve...`**, exported or not, including a private
  `_resolve...` helper. The word names neither side, so it carries no
  information inside a file either. The one `resolve` that is fine is the
  promise sense, where the function settles a pending promise.
- **`build...`, `create...`, and `compute...` are retired on exported
  functions** that are really one of the shapes above. A small prefix
  vocabulary where each prefix carries information beats a wide set of
  near-synonyms.
- The exceptions to the four bullets above: a genuine constructor with no
  source (`createApp`, `createId`); an action (`syncPile`); a predicate
  (`isResolvableIanaZone`); a non-exported `_build...` helper, whose callers
  are in its own file and can see its source, so the verbose form is not
  wanted there; a name fixed by an external contract (`toJSON`, `toString`);
  and a function returning user-facing copy, which is named after the copy
  itself with no prefix at all (`memberLabel`).
- These naming shapes come from the Avandar TypeScript checklist, at
  `.agents/skills/avandar-code-review/docs/code-reviews/typescript-checklist.md`.
  Read its naming bullets for the worked examples and the greps that find
  offenders. Where this file and that checklist disagree, the checklist wins.

## Functions & Logic

- Keep functions short (<= 45 lines).
- Extract logic into utility functions if:
  - The function will be too long otherwise
  - The logic will be reused

## Language & framework rules

The rules for this project's language and frameworks live in `docs/rules/`:

- [See our TypeScript rules](docs/rules/typescript.md)
- [See our SQL rules](docs/rules/sql.md)
- [See our styling and UI rules](docs/rules/styling.md)
- [See our routing rules](docs/rules/routing.md)

Two conventions follow from `apps/server` executing its TypeScript directly:

- **Relative imports must include the `.ts` extension.** Node's type stripping
  resolves them literally. oxlint enforces it under `apps/server/**` and
  `packages/shared/**`, enforces the real `.ts` or `.tsx` extension under
  `packages/emails/**`, which emits and rewrites it to `.js`, and forbids an
  extension under `apps/web`.
- **Anything imported from `@memory-shoebox/shared` at runtime must be plain,
  erasable TypeScript.** A runtime import is ordinary rather than delicate: a
  route that validates a request holds its schema at runtime, not just its
  shape. What the constraint rules out is syntax Node cannot strip, and
  `apps/server/test/sharedRuntimeImport.test.ts` is the standing guard. See
  [`docs/shared.md`](docs/shared.md).

## Agent skills

- This project's agent skills are installed by two tools and neither should be
  driven by hand: `npx skills` for everything in `skills-lock.json`, and
  `npx impeccable` for the `impeccable` skill, which ships its own installer.
- **Never create or edit anything under `.agents/`, `.claude/skills/`,
  `.cursor/skills/`, or `.opencode/`.** Those directories are generated by the
  two installers above, and a hand edit is overwritten the next time either
  runs. They are **tracked rather than gitignored**, deliberately:
  `.agents/skills/` holds the real skill folders and each per-frontend
  directory is symlinks into it, so a fresh clone gets the exact skill set this
  project expects without a network call. See the note in `.gitignore`. A hand
  edit therefore does not simply vanish; it lands in a commit on its way out.
- A fresh clone needs nothing extra: `pnpm install` restores the locked skills.
  `pnpm skills` lists what is installed,
  `pnpm skills:install` is the same step run on demand, and
  `pnpm skills:update` upgrades everything to the latest.
- `pnpm skills:update` runs `scripts/skills/update-skills.sh`, which
  updates both managers: `npx skills` for the lock, and each self-installing
  skill (the list at the top of the script) through its own CLI. Update skills
  there, never by calling one manager by hand.
- To add or remove a skill, use `npx skills add` / `npx skills remove` and
  commit the resulting `skills-lock.json` change in the same commit.
- The wrapper lives in `scripts/skills`. See [`docs/skills.md`](docs/skills.md)
  before changing it.
