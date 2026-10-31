# Comment Tagging Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved member identity, avatar, collection, and comment-tagging flows as one coherent release.

**Architecture:** Keep plain comment text with explicit member ranges, stable member IDs, and the existing archive and transactional email outbox. Implement five ordered slices; identity comes first, avatars and collection reads can then proceed independently, and comment integration consumes both.

**Tech Stack:** TypeScript, React, Mantine, TanStack Router/Query, Fastify 5, Kysely/SQLite, Backblaze B2, Zod, Vitest, and Playwright. Use the installed pnpm workspace versions; no framework migration.

**Spec:** [Approved scope](../specs/2026-10-31-comment-tagging-design.md) and [approved UI/UX shape](../specs/2026-10-31-comment-tagging-ux-shape.md). Read both before execution.

**Status:** Implementation, local recovery/resource acceptance, and final workspace/browser checks passed on 2026-10-31. Independent task/whole-branch review and consolidated artifact delivery remain pending in the [verification record](../verification/2026-10-31-comment-tagging.md). Native/assistive limits remain open. Deployment has not run.

## Global Constraints

- Apply the shared execution rules in the [plan index](2026-10-31-comment-tagging-plan.md#execution-rules).
- Use **comment tagging / comment-tagged** and **photo tagging / photo-tagged**.
- Only member accounts appear in `@`; keep account emails private.
- Unique account names, own avatars, combined visible photos/videos, and separate comment-tag emails defaulting on are approved requirements.
- Subsequent explicit implementation authorization activated this plan. Deployment, push, merge, and PR creation remain outside execution scope.

## Review Focus

- Historical name collisions and locale-dependent casing: N1/N2 test normalization and atomic refusal.
- A failed avatar replacement must retain the current image: A1/A2 test reservations, stale versions, and deletion races.
- A selected member must not widen archive access: C1/C2 test visible union counts and every selection consumer.
- A tag's text can outlive its current name or eligibility: T1/T2/T4 test snapshots, old clients, offsets, and removal.
- The recipient can lose eligibility after queueing: T3 tests the last delivery gate and retries.

---

## Execution order and ownership

| Plan                                                                 | Deliverable                                                | Prerequisites                     | Tasks |
| -------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------- | ----- |
| [1. Account identity](2026-10-31-comment-tagging-identity.md)        | Unique claimed names, profile completion, photo-tag labels | None                              | N1-N4 |
| [2. Avatars](2026-10-31-comment-tagging-avatars.md)                  | Private own-avatar lifecycle and shared presentation       | N1-N4                             | A1-A3 |
| [3. Member collection](2026-10-31-comment-tagging-collection.md)     | Uploaded OR photo-tagged archive selection                 | N1-N4; A3 for avatar presentation | C1-C2 |
| [4. Comment tags and email](2026-10-31-comment-tagging-comments.md)  | Tag editing, notifications, links, return journey          | Plans 1-3                         | T1-T5 |
| [5. Integrated acceptance](2026-10-31-comment-tagging-acceptance.md) | Local multi-user/browser proof and rollout documentation   | Plans 1-4                         | V1-V2 |

There are 16 reviewable tasks. Recommended execution is subagent-driven because
identity, storage, archive authorization, and mail delivery have separate failure
boundaries. If selected, assign one task at a time using the required skill.
Plans 2 and 3 may be developed concurrently only after their shared DTO edits
have a single owner. Do not concurrently edit migrations, shared exports, or
schema manifests. Native execution uses the same order and task gates.

The inspected product baseline is `790de6af`; approval is recorded at `9aabc1f2`.
Before implementation compare the target checkout against that baseline. Reconcile
changed paths/interfaces without changing the approved behavior. Migration names
0019, 0020, and 0021 below are reserved in this plan against baseline 0018; if
occupied at execution, allocate consecutive unused numbers and update all three
plans before writing them. Never edit an already shipped migration.

## Execution rules

- Work in an isolated `wt` worktree after loading `using-wt`; keep changes within
  these plans. Read the repository and parent `AGENTS.md`, relevant feature docs,
  `docs/architecture.md`, and language/UI rules. Run `pnpm skills` once.
- Use red/green TDD for behavior: write the listed assertions, run the targeted
  command and observe its intended failure, implement, then rerun to pass. Do not
  call a missing fixture the red result. Reuse existing test helpers and add only
  scenario setup the test actually needs. Checkbox snippets specify assertions;
  imports and fixture setup are deliberately omitted.
- Use `impeccable` for all UI work, `mantine-combobox` for the picker,
  `playwright-best-practices` for browser tests, and `cli-command-conventions` for
  the rollout command. Preserve the approved shape; no new design interview.
- Server/shared relative imports use `.ts`, email imports their real `.ts`/`.tsx`,
  and web imports have no extension. Shared runtime exports must be erasable.
  Register additions in `packages/shared/scripts/sharedExports.json`, run
  `pnpm --filter @memory-shoebox/shared generate:exports`, then
  `pnpm --filter @memory-shoebox/shared check:exports`. Do not hand-edit generated
  exports or `routeTree.gen.ts`.
- Public helpers have docstrings and descriptive source/target names. Keep
  functions at most 45 lines and components one per file. New web tests live
  beside their component/helper in the same-named directory. No new barrels.
- Every schema change updates `db/types`, `db/schemaManifest`, and
  `db/schemaExpectations`, including indexes/constraints; add migration tests.
  `migrateToLatest` owns transactions and backups. Migrations must not open their
  own transactions, perform media I/O, or read operator files.
- No real email tests: use recording delivery or local HTML/plain text. Browser
  API runtime must have `NODE_ENV=development`, `ENABLE_FAKE_EMAIL=true`, and
  injected no-mail services. Browser compilation may use production semantics.
  Use disposable local catalogs and fake B2 only.
- Update shipped feature docs in the task that changes behavior. These plans
  do not prematurely rewrite shipped docs. No unrelated cleanup or refactoring.
- Commit each passing task in the implementation worktree. Stage only that task's
  files, inspect `git diff --cached`, and use its suggested commit subject.
  No push, merge, deployment, production mutation, or PR without separate scope.
- Run `pnpm check` and the targeted browser suite once at integrated acceptance.
  Repeat checks only after fixes or when evidence exposes an unresolved concern.

## Cross-plan contracts

| Owner | Stable contract consumed later                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------- |
| N1/N3 | `makeAccountNameKeyFromName`, `accountNameSchema`, `MeDto.profileComplete`, `Viewer.profileComplete` |
| N4    | `PersonRef.isMember`, `personLabel(person)`; no email in member references                           |
| A1/A3 | `AvatarRef`, nullable `MemberRef.avatar`, shared `MemberAvatar`                                      |
| C1/C2 | `TimelineSelection.member`, URL `/?member=<uuid>`, member collection response                        |
| T1    | `CommentTagInput`, `CommentTag`, `CommentDto.commentTags`, atomic text/range normalization           |
| T3    | `NotifyPreferences.onCommentTag`, `comment_tag` outbox kind and permanent scheduling ledger          |
| T4/T5 | `CommentDraft`, `CommentTagInputField`, session-owned conversation memory, `?comment=<uuid>`         |

Definitions live in the owning task's Interfaces block. JSON uses null for an
absent avatar/version; internal optional state uses undefined. Member IDs remain
UUIDs, never name-based keys. Every non-admin response remains email-free except
`/me`, which returns the caller's own address.

## Requirement-to-task coverage

| Approved scope / shape surface                                     | Implementing tasks |
| ------------------------------------------------------------------ | ------------------ |
| Unique names, reserved historical names, collision migration       | N1-N3              |
| A/B: profile completion and account name editing                   | N3/N4              |
| G: all photo-tag identities show membership                        | N4                 |
| B/C: add, crop, replace, remove own avatar                         | A1-A3              |
| D: member-only typeahead and robust range editing                  | T1/T2/T4           |
| E: styled tag links and comment avatars                            | A3/T4              |
| F: combined archive and return journey                             | C1/C2/T5           |
| H: separate email preference, all-on/all-off                       | T3                 |
| I: email copy, deduplication, cancellation, last eligibility check | T3                 |
| J: email entry through sign-in/profile completion                  | N4/T5              |
| Theater, mobile, accessibility, interruptions                      | T4/T5/V1           |
| Rollout, recovery, resource bounds, deployment constraints         | N2/A2/V2           |

## Completion evidence

Each plan ends in passing focused tests and current documentation, not a deployed
feature. V1/V2 own final evidence. Record actual commands, results, captures, and
limitations in `docs/superpowers/verification/2026-10-31-comment-tagging.md` at
execution time. Do not mark unsupported browser, screen-reader, or runtime claims
as passing. Implementation decisions and measured resource corrections are recorded in the verification record.
