# Agent skills

This project ships a curated set of agent skills so every coding agent working
here starts with the same tooling. This document explains how they get onto
disk and who owns what.

## Two managers, one wrapper

Skills come from two tools that know nothing about each other:

- **`npx skills`** installs everything listed in `skills-lock.json`. It writes
  the real skill directories to `.agents/skills/`, symlinks them into
  `.claude/skills/` for Claude Code, and relies on Cursor, OpenCode, and Codex
  reading `.agents/skills/` natively.
- **`npx impeccable`** installs the `impeccable` skill. It ships its own
  installer and writes a copy per frontend (`.agents`, `.claude`, `.cursor`,
  `.opencode`) plus its hook manifests, so it is never in `skills-lock.json`.

One wrapper and one script cover both, so there is a single place to ask what
is installed and a single place to bring it up to date:

- `pnpm skills`: merged listing of every skill, flagging any that are missing.
- `pnpm skills:install`: install the locked skills that are not on disk yet.
- `pnpm skills:update`: update every skill, from both managers.

The first two run this project's own skills tooling under `scripts/skills`.
`pnpm skills:update` runs `scripts/skills/update-skills.sh`, which is a
plain shell script on purpose: updating skills is the one thing every project
does the same way whatever it is written in, so it does not go through the
language's own tooling. The script updates everything in the lock with
`npx skills update`, then updates each self-installing skill through its own
CLI. That list is at the top of the script, written when the project was
scaffolded:

```sh
SELF_INSTALLING_SKILLS="impeccable"
```

Never create the per-frontend symlinks or copies by hand. Each manager owns the
layout its own frontends expect, and hand-made links drift the moment either
tool changes.

## What git tracks

**The skills themselves, and the lock.** `.agents/skills/` holds the real skill
directories and every per-frontend directory is symlinks into it, so a clone
gets the exact skill set this project expects without a network call and
without anybody having to remember an install step. Around 1.8MB.

Tracking them is a deliberate reversal of the usual advice about vendored
content. The reason is that a skill is an instruction to an agent, so an
untracked skill set means two people working in this repository are being
given different instructions, and neither can see the difference. That is
worse than the disk cost.

Only genuinely machine-local files stay ignored: `.claude/settings.local.json`
and `CLAUDE.local.md`.

The lock is still the manifest of what this project wants from elsewhere, and
installing is what makes the working tree match it:

- A fresh clone needs nothing extra: the skills are already there. `pnpm
install` reconciles anything the lock asks for that is missing, and leaves
  everything else untouched.
- Install and update are separate for the same reason a package manager keeps
  them separate: `pnpm skills:install` materializes what is locked without
  upgrading anything, and `pnpm skills:update` is the deliberate "go get
  the latest" step.
- Where the restore runs automatically, `CI=true` or `SKIP_SKILLS_INSTALL=1`
  turns it off. No agent frontend runs in CI, so the network cost there buys
  nothing. The `postinstall` hook runs `scripts/skills/postinstall.sh`, which
  checks those variables and exits before invoking anything else. The check
  lives in that wrapper rather than in the TypeScript CLI because the CLI runs
  through `tsx`, a dev dependency: a production install (`pnpm install --prod`,
  which the Docker image runs) has no `tsx` to invoke, so the decision to skip
  has to be made first.

## Changing the skill set

Add or remove skills with the manager, not by editing directories:

```sh
npx skills add <owner>/<repo> --skill <name> --agent claude-code cursor opencode codex
npx skills remove <name>
```

Both commands update `skills-lock.json`. Commit that change: it is what every
other clone and CI checkout installs from.

The lock was not written by hand. The scaffolder that created this project ran
`npx skills add` for each skill its manifest selects for a project of this
shape, and those installs wrote `skills-lock.json`. That is why a fresh project
starts with a curated list rather than an empty one; from here on the lock is
this repository's own, and the commands above are what change it.

## Skills this repository writes itself

`skills-lock.json` covers skills that come from somewhere else. A skill authored
here is a different thing and lives in a different place:

**Authoring source: `skills/<name>/`.** Edit it there. It is the one copy a
human is meant to change, and it sits beside the code it describes rather than
among a hundred vendored directories.

`.agents/skills/<name>` is an install target, not a source. Both are tracked,
but only one is written by hand: `npx skills` owns that directory for
everything in the lock and will happily replace what it finds there, so a
locally authored skill that lived only in `.agents/` would be one
`pnpm skills:update` away from disappearing.

**It runs on its own after `pnpm install`**, from the same postinstall hook
that restores the locked skills, immediately after it: `npx skills` owns
`.agents/skills/`, so a local skill has to be written there once it has
finished. Run it by hand after editing a skill:

```sh
pnpm skills:local
```

That copies each one into `.agents/skills/<name>`, which is the cross-runtime
location Codex, Cursor and OpenCode read natively, then symlinks it into every
frontend directory that exists (`.claude/skills`, `.cursor/skills`,
`.opencode/skill`). The same shape `npx skills` produces, so the two coexist.

It copies rather than symlinking out of `skills/`, because a symlink pointing
outside the frontend directory confuses some runtimes.

Both copies are tracked, which means they can drift inside a single commit if
somebody edits the source and does not re-run the install. **`pnpm check` runs
`pnpm skills:check`**, which compares them without writing anything and fails
with the command to fix it. Catching that in review matters more than it
sounds: the failure mode is an agent reading a stale copy of its own
instructions and nobody being able to see why it behaved oddly.

The script only fans out to a frontend whose parent directory already exists.
Creating `.opencode/` would tell a runtime to look somewhere nothing else in
this project writes.

| Skill                                                               | What it is for                                                                                                                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`prototype-to-contract`](../skills/prototype-to-contract/SKILL.md) | Taking a product or large feature from nothing to a buildable plan: design language, prototypes of every state, data model, API contract, build plan |
