# famgram

A client-side single-page application (SPA) built with Vite, React, Mantine,
and TanStack Router. There is no server-side rendering and no server entry
point: everything runs in the browser. We do **not** use TailwindCSS.

## Getting started

```sh
pnpm install     # install dependencies, plus any missing agent skill
pnpm dev         # start the Vite dev server with hot reload
pnpm build       # type-check (tsc -b) and build for production
pnpm preview     # preview the production build locally
pnpm type-check  # run the TypeScript compiler without emitting
pnpm test        # run the test suite with vitest
pnpm lint        # lint with oxlint
pnpm format      # format with oxfmt
pnpm check       # format check, lint, build, and test: run before pushing
```

## Agent skills

Agent skills are not tracked in git, but `skills-lock.json` is.
A fresh clone needs nothing extra: `pnpm install` restores the locked skills.
Run `pnpm skills` to see what is installed and
`pnpm skills:update` to upgrade them. See
[`docs/skills.md`](docs/skills.md) for how the two skill managers
divide the work.

## Agent rules

Coding conventions live in `AGENTS.md`, which is the single source of truth.
`CLAUDE.md` (Claude Code) and `.cursor/rules/agents.mdc` (Cursor) are symlinks
to it, and it is also the file the Codex CLI reads natively. Update `AGENTS.md`
and every tool stays in sync.
