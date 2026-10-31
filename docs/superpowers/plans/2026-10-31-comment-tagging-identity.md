# Account Names and Photo-tag Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every participating member a unique claimed name and make non-member photo identities unambiguous.

**Architecture:** Use a shared account-name normalizer, SQLite name claims, and an authenticated profile-completion step. Keep suggested invitation names separate from claimed identity; derive photo-tag membership through people.member_id and the linked account status.

**Tech Stack:** TypeScript, React, Mantine, TanStack Router/Query, Fastify 5, Kysely/SQLite, Backblaze B2, Zod, Vitest, and Playwright. Use the installed pnpm workspace versions; no framework migration.

**Spec:** [Approved scope](../specs/2026-10-31-comment-tagging-design.md) and [approved UI/UX shape](../specs/2026-10-31-comment-tagging-ux-shape.md). Read both before execution.

**Status:** Implementation, local recovery/resource acceptance, and final workspace/browser checks passed on 2026-10-31. Independent task/whole-branch review and consolidated artifact delivery remain pending in the [verification record](../verification/2026-10-31-comment-tagging.md). Native/assistive limits remain open. Deployment has not run.

## Global Constraints

- Apply the shared execution rules in the [plan index](2026-10-31-comment-tagging-plan.md#execution-rules).
- Names retain spaces and accents, with the existing 80-character limit; reject `@`, line breaks, and invisible formatting controls.
- Compare by NFC, trim, collapsed whitespace, and Unicode lowercase without locale selection. Accents remain meaningful.
- Claims are permanent to their member ID, including after rename/removal. Ad-hoc names are outside this namespace.
- Taken-name copy: “That name is already taken. Try adding your last-name initial, like John M.”
- Always render `(not a member)` for ad-hoc or no-longer-active photo identities; never store the suffix.

## Review Focus

- Composed/decomposed accents and host locale: N1 pins deterministic keys without accent folding.
- Two accounts claiming the same name: N2/N3 require one atomic winner and no partial person rename.
- Removed members and unaccepted invitations: N2/N3 preserve history without treating invitation suggestions as new claims.
- Old clients clearing a name or bypassing profile completion: N3 tests server refusal, not just routing.
- A new ad-hoc chip before a server response: N4 tests its visible and accessible suffix immediately.

---

## File responsibilities

Shared name validation belongs in `packages/shared/src/accountNames/accountNames.ts`.
Persistence and rollout analysis live under `apps/server/src/members/`; account
routes own HTTP translation. Profile completion has its own web surface while
reusing the sign-in card. Membership labels belong in one shared web copy helper.
No public name-availability endpoint is added.

### Task N1: Account-name and membership contracts

**Files:** Create `packages/shared/src/accountNames/accountNames.ts` and
`packages/shared/src/accountNames/accountNames.test.ts`. Modify `packages/shared/scripts/sharedExports.json`. N3 owns the account
payload additions; N4 owns the membership DTO addition, so this task remains
independently type-checkable.

**Interfaces:** Produce `accountNameSchema`, `makeAccountNameKeyFromName(name:
string): string`, the validated account-name type. Keep `MemberRef` email-free. The schema returns
NFC, trimmed, whitespace-collapsed display spelling; the key additionally uses
`toLowerCase()`, never `toLocaleLowerCase()`. This is a new account-specific
helper; do not change existing vocabulary normalization as incidental cleanup.
N3 will adopt this schema in `UpdateMeRequest.displayName`; this task does not
change existing request/response shapes.

- [x] **Red:** Add these assertions plus empty, newline, format-control, and 81-character refusal cases:

```ts
expect(makeAccountNameKeyFromName("  JoHN   M ")).toBe("john m");
expect(makeAccountNameKeyFromName("Sofi\u0301a")).toBe("sofía");
expect(makeAccountNameKeyFromName("Sofia")).not.toBe("sofía");
expect(accountNameSchema.safeParse("@John").success).toBe(false);
expect(accountNameSchema.safeParse(null).success).toBe(false);
```

- [x] **Run red:** `pnpm --filter @memory-shoebox/shared test src/accountNames/accountNames.test.ts`. Expect the new contracts to fail before implementation.
- [x] **Green:** Implement the named exports and schemas. Generate shared exports; preserve existing payload privacy.
- [x] **Verify:** Rerun the command and shared `check:exports`; expect PASS. Update `docs/shared.md` with the normalization rule.
- [x] **Commit:** `feat: define unique account name contracts`.

### Task N2: Claims, collision staging, and atomic migration

**Files:** Create `apps/server/src/db/migrations/0019_member_name_claims.ts`,
`apps/server/src/members/claimMemberName.ts`,
`apps/server/src/members/readMemberNameRollout.ts`,
`apps/server/scripts/memberNames.ts`,
`apps/server/test/members/claimMemberName.test.ts`,
`apps/server/test/members/memberNameRollout.test.ts`, and
`apps/server/test/schema/memberNameClaimsMigration.test.ts`.
Modify `apps/server/src/db/migrations/migrations.ts`,
`apps/server/src/db/types/identityAndAccess.types.ts`,
`apps/server/src/db/types/db.types.ts`,
`apps/server/src/db/schemaManifest/identityAndAccess.ts`,
`apps/server/src/db/schemaExpectations/identityAndAccess.ts`, and
`apps/server/src/db/schemaExpectations/indexColumns.ts`.

**Interfaces:** Consume N1. Produce
`claimMemberName(options: Readonly<{ transaction: DatabaseExecutor; memberId:
string; displayName: string; now: string }>): Promise<void>`.
Produce `readMemberNameRollout(database: DatabaseExecutor):
Promise<MemberNameRollout>` with rows `{ memberId, currentName, proposedName,
issue: "collision" | "invalid" | null }` and `catalogFingerprint: string`.
`currentName` includes the pre-migration email-local fallback for audit only.
Do not expose this report through member APIs.

Schema: `member_name_claims(name_key TEXT PRIMARY KEY, member_id TEXT NOT NULL
REFERENCES members(id), display_name TEXT NOT NULL, created_at TEXT NOT NULL)`;
index `member_id`. Add nullable `members.profile_completed_at` and
`members.suggested_display_name`. Claimed spelling lives in `members.display_name`.
The claim action checks an existing key's owner, inserts if absent, updates the
member, and calls `syncMemberPerson` inside the caller's immediate transaction.
Returning to one's own prior key succeeds. Conflicts return `name_taken` without
owner details.

The new command has `audit --database <path>` and
`stage --database <path> --assignments <json>`. Audit opens the specified existing
catalog read-only and prints JSON. Stage requires the stopped catalog, takes a
verified backup, and validates a JSON object `{ catalogFingerprint, assignments:
[{ memberId, displayName }] }`. It stores validated choices in the temporary
catalog table `member_name_rollout_assignments`; it does not rename members.
The migration reads and drops this table transactionally. No operator file or
environment read inside the migration. A fingerprint mismatch, duplicate mapping,
unknown ID, invalid final name, or unresolved collision aborts without changes.

Preserve every unique legacy effective name, including retained removed accounts.
Legacy invited names may be reserved during this one-time import but still require
profile completion on first sign-in. Active/previously joined legacy accounts
with validated names become complete; unjoined invited accounts remain incomplete.
For new invitations after N3, suggestions never claim names. Empty fresh catalogs
migrate without a mapping. Do not choose a winner or number conflicting names.

- [x] **Red:** Test historical subset migration and two independent DB connections contending for a claim. Assert no partial member/person/claim writes on late failure:

```ts
expect(winningClaims).toHaveLength(1);
expect(losingError.code).toBe("name_taken");
expect(afterFailedMigration).toEqual(beforeFailedMigration);
expect(await claimOldNameForOriginalOwner()).toBeUndefined();
expect((await claimOldNameForOtherMember()).code).toBe("name_taken");
```

Also test CLI help before file access, read-only audit, stale mapping refusal,
backup creation, redirected JSON stdout, progress/recovery on stderr, cancellation,
and the bare-command action wizard per `cli-command-conventions`.

- [x] **Run red:** `pnpm --filter @memory-shoebox/server test test/members/claimMemberName.test.ts test/members/memberNameRollout.test.ts test/schema/memberNameClaimsMigration.test.ts`.
- [x] **Green:** Implement the transaction action, bounded small-member audit, command, and additive migration. Keep legacy normalization frozen in this migration's helper so later product changes cannot reinterpret an old migration.
- [x] **Verify:** Rerun focused tests, then `pnpm --filter @memory-shoebox/server test test/schema test/db/migrationSafety.test.ts`. Update `docs/migrations.md` and create `docs/member-profiles.md` with staging and claim ownership.
- [x] **Commit:** `feat: enforce permanent member name claims`.

### Task N3: Claim names on every write path and enforce completion

**Files:** Modify `apps/server/src/routes/me.ts`,
`apps/server/src/members/getMeDtoFromMemberId.ts`,
`apps/server/src/members/getDisplayNameFromMember.ts`,
`apps/server/src/members/syncMemberPerson.ts`,
`apps/server/src/auth/createAuthenticator.ts`,
`apps/server/src/http/requestContextHelpers.ts`,
`apps/server/src/administration/inviteMember.ts`,
`apps/server/src/setup/initializeShoebox.ts`,
`apps/server/scripts/seedMember.ts`,
`apps/server/src/routes/items/createItemCommentRoute.ts`,
`apps/server/src/routes/comments.ts`, `apps/server/src/routes/uploadSessionsRoutes/uploadSessionsRoutes.ts`, and
`packages/shared/src/auth.ts`. The upload route module owns one pre-handler
that checks completion for its mutations; reads and cancellation retain their
existing access rules.
Create `apps/server/src/members/requireCompleteProfile.ts` and
`apps/server/test/routes/profileCompletion.test.ts`. Extend
`apps/server/test/seedMember.test.ts` and existing setup/invitation tests.

**Interfaces:** Add required `MeDto.profileComplete: boolean` and
`suggestedDisplayName: string | null`. Adopt N1 in optional
`UpdateMeRequest.displayName`, rejecting null/empty names. Extend `Viewer` with `profileComplete: boolean`, populated from
`profile_completed_at`, not display-name truthiness. Produce
`requireCompleteProfile(viewer: Readonly<Viewer>): void`, throwing
`403 profile_required` for incomplete identities. `PATCH /api/me` claims names
through N2 and returns the existing `MeResponse` envelope. First successful
claim sets completion; later rename preserves that timestamp.

New invitations store an unclaimed suggestion separately. Restoring an existing
claimed identity preserves it; a supplied replacement must use the claim action
and cannot clear its name. First-admin setup and seed tools claim atomically.
Incomplete identities cannot create/edit comments or start/modify archive uploads;
allow their session, `/me`, profile/avatar setup, and sign-out. Keep standard
item-visibility 404 checks before detailed target errors. Never expose an email
fallback in public member/person refs; unnamed identities use “Member” until they
claim a name and remain excluded from `@`.

- [x] **Red:** Exercise the real routes with existing `createTestApp`, `insertSignedInMember`, and seed helpers:

```ts
expect(taken.statusCode).toBe(409);
expect(taken.json().error).toBe("name_taken");
expect(JSON.stringify(taken.json())).not.toContain(otherEmail);
expect(incompleteComment.statusCode).toBe(403);
expect(complete.me.profileComplete).toBe(true);
```

Pin rollback on person-sync failure, invitation suggestion collisions being
allowed, restored claimed-name clearing being refused, anonymous non-enumeration,
and complete-profile admin/viewer role behavior.

- [x] **Run red:** `pnpm --filter @memory-shoebox/server test test/routes/profileCompletion.test.ts test/seedMember.test.ts test/setup test/auth test/administration`.
- [x] **Green:** Route every actual claimed-name write through N2; do not rename ad-hoc people. Update test seed helpers to create a valid unique claimed account by default, with an explicit incomplete fixture. Add profile completion guards to all affected write entry points.
- [x] **Verify:** Rerun the command; expect PASS. Update `docs/auth.md`, `docs/administration.md`, `docs/setup.md`, and `docs/member-profiles.md`.
- [x] **Commit:** `feat: require claimed names before participation`.

### Task N4: Profile form, account rename, and membership labels

**Files:** Create `apps/web/src/routes/complete-profile.tsx`,
`apps/web/src/surfaces/ProfileCompletion/ProfileCompletion.tsx`,
`apps/web/src/surfaces/ProfileCompletion/ProfileCompletion.test.tsx`,
`apps/web/src/system/personLabel/personLabel.ts`, and its colocated test.
Modify `packages/shared/src/dtos.ts` and `apps/web/src/routes/_app.tsx`,
`apps/web/src/surfaces/SignIn/useSignInFlow.ts`,
`apps/web/src/surfaces/Account/NameField.tsx`,
`apps/web/src/surfaces/Account/YouSheet/YouSheet.tsx`,
`apps/web/src/api/me/me.ts`,
`apps/server/src/people/readPersonTaggingOptions.ts`,
`apps/server/src/archive/readPeopleDirectory.ts`,
`apps/server/src/archive/readPeopleRefsByItemId.ts`,
`apps/server/src/archive/readFacets.ts`, and the identity-rendering consumers:
`system/PeopleField/{PersonNameOption,PersonPills}.tsx`,
`surfaces/Upload/UploadLabelModal/UploadPersonField/UploadPersonChoice.tsx`,
`surfaces/People/PersonCard/PersonCard.tsx`,
`surfaces/Timeline/FilterChips/PeopleChips.tsx`,
`surfaces/Timeline/FilterSheet/PeopleFacetSection.tsx`, and
`surfaces/Item/InThisOne/usePersonChoices.ts` under `apps/web/src`.

**Interfaces:** Consume N1/N3 and add required `PersonRef.isMember: boolean`. Produce `personLabel(person: Readonly<PersonRef>):
string`, returning the raw name for active linked members and `${name} (not a
member)` otherwise. Server readers derive `isMember` with a members join and
status check, never a name match. Client-created ad-hoc choices use false before
posting. Preserve raw names for lookup, rename inputs, and persistence.

The authenticated `/complete-profile?redirect=<safe-local-href>` route uses the
approved one-card form and `PATCH /me`. Preserve the full destination, including
`?comment`, through sign-in and completion. Reuse `makeSafeHrefFromRedirect`;
external and protocol-relative destinations fall back to `/`. The photo row is
added by A3, not a fake upload control in this task. Account saves retain current
independent field reconciliation and give focus to the invalid name on conflict.

- [x] **Red:** Test completion redirect, name conflict and retry, no email-as-name placeholder, and pending edits surviving failed saves:

```ts
expect(personLabel({ personId, displayName: "Jorge", isMember: false })).toBe(
  "Jorge (not a member)",
);
expect(
  screen.getByRole("option", { name: "Jorge (not a member)" }),
).toBeVisible();
expect(savedRequest.displayName).toBe("John M");
expect(destination).toBe(`/items/${itemId}?comment=${commentId}`);
```

Cover selected chips, new ad-hoc choices, bulk/upload, directory and filters,
removed linked identities, safe redirects, and changed account during save.

- [x] **Run red:** `pnpm --filter @memory-shoebox/web test src/surfaces/ProfileCompletion src/system/personLabel src/system/PeopleField src/surfaces/Account/YouSheet src/routes/-bootstrap-redirect.test.ts`.
- [x] **Green:** Implement the form and shared label, wire every named consumer and shared photo-tagging picker, and add explicit “Photo-tag someone” copy from the approved shape. Generate routes through the normal Vite tooling.
- [x] **Verify:** Rerun focused tests and server people-reader tests, then both package type checks. Update `docs/member-profiles.md`, `docs/archive.md`, and the obsolete member/non-member presentation rule in `DESIGN.md`.
- [x] **Commit:** `feat: complete profiles and distinguish photo-tag identities`.
