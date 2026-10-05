# Step 8a: Administration and the admin's read surfaces

> Historical source references. `reference/` and `@memory-shoebox/reference` below are historical shorthand for the retired surface package at commit `3e09157b`, not current paths or runnable instructions. Read that commit for the original source spelling. Product decisions remain binding; current implementation and acceptance are documented in `docs/web.md` and step 9 verification.

**Status:** implemented; automated verification and full Avandar Auto review complete; final acceptance deferred
**Parallel with:** 8b
**Depends on:** steps 1, 2, 3a and 5a

## What this step delivers

The last backend slice and the last of the email contract. Members and
invitations, groups, instance settings, and the three admin reads: who has been
looking, what has been changed, and whether mail is going out at all. It also
builds first-run setup: an empty member catalog opens setup, the first person
creates the initial admin account and names the Shoebox, and an optional final
invitation screen leads to the home page with upload available.

**Acceptance sequencing:** step 7b's remaining live/manual and integrated API
acceptance is deferred to the final acceptance stage after every build step. It
is not a prerequisite for starting or implementing this step.

**Step design:**
[`2026-10-04-administration-design.md`](../../../superpowers/specs/2026-10-04-administration-design.md).

**Detailed implementation plan:**
[`2026-10-04-administration.md`](../../../superpowers/plans/2026-10-04-administration.md).

**Done when:** an admin can invite somebody who then signs in, change a role,
build a group and watch it change what a member can see, rename the Shoebox,
change its timezone and watch the affected days move, and open a diagnosis when
mail stops. A fresh deployment must also be usable without a manually seeded
member: setup creates exactly one active admin, signs that person in, and
ends at invitations that may be skipped before opening the upload-capable home
page. Concurrent or repeated setup submissions must never create a second
initial admin or overwrite an initialized Shoebox.

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
   before asking anything. `administration.md` and `notifications.md` both end
   with a `## Rulings` section, eight and ten answers respectively. Ask the user
   only what they genuinely do not settle.
2. **Write the step design** at
   `docs/superpowers/specs/YYYY-MM-DD-administration-design.md`.
3. **`superpowers:writing-plans`** for the detailed implementation plan.
4. **`superpowers:subagent-driven-development`** to implement it.

## Read these first

| Document                                                                     | What you need from it                                                                                                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/administration.md`      | **The whole file**, including its `## Rulings`. Eighteen routes, the largest slice                                                                  |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/notifications.md`       | **Part 2 entirely**: presence, item viewers, activity, mail health. Plus § 2 `invitation`, whose copy this step owns                                |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/data-models.md`              | § `members`, § `invitations`, § `groups`, § `settings`, § `activity_events`, § `item_views`, § Privacy, § The last admin, Decisions 1, 2, 11 and 17 |
| `docs/prds/2026-09-27-memory-shoebox/design-spec.md`                         | Surfaces 11, 12, 13, 17 and 18 and their states                                                                                                     |
| `reference/` surfaces `settings`, `members`, `groups`, `presence`, `changes` | Every state. `mail-failing`, `last-admin`, `delete-used` and `gone` are the four that carry the most rules                                          |
| `reference/` surface `emails`, state `invitation`                            | The message this step sends                                                                                                                         |
| `docs/PRODUCT.md`                                                            | § How it works: roles, groups, invitations. § Product principle 1, private by construction                                                          |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md`         | § `SETTING_DEFINITIONS`, § Rate limits (the invitation resend row is new), § The three documented exceptions                                        |

## Scope

**In:**

- First-run setup, including its web screens, route guards, shared schemas and
  server routes. Setup is available only when **no member rows exist**, not
  when there are no items or no currently active members. Loading the page
  does not reserve ownership; successful account creation under an immediate
  transaction chooses the initial admin.
- Shoebox name, the initial admin's name and email, the instance timezone
  seeded from the browser, and public URL. Keep pile arrangement at its
  existing default. Offer mail sender settings without making email delivery
  a prerequisite for creating the first admin. Infrastructure credentials stay
  in server configuration.
- An authenticated final invitation screen using this step's real invite
  route, with an explicit skip action. Inviting or skipping completes setup
  and opens `/`, where the admin can upload. Interrupted onboarding resumes
  without reopening anonymous account creation.

- Members and invitations: invite, resend, revoke, change a role, remove a
  member, revoke any device. **The last admin can be neither demoted nor
  removed**, and an admin may demote another admin
- `GET /api/member-suggestions`, which stays separate from `GET /api/people`
  because its `itemCount` is unfiltered and correct only for an admin
- Groups: list, create, rename, add and remove members, delete. The delete
  carries a confirmation token, an HMAC over the digest of what the admin was
  shown, valid ten minutes, because the dangerous half of deleting a group is a
  silent widening and a rule added between reading and pressing must not be
  approved unseen
- Every group change bumping `visibilityGeneration`
- `GET /api/settings` (admin) and `PATCH`, including the timezone change, which
  rewrites `captured_on` for every item that carried no offset and writes
  `item_capture_date_changes` rows with `reason = 'timezone_change'`, **one per
  moved item**, so each is revertible
- `GET /api/presence` and `GET /api/items/:itemId/viewers`, both admin-scoped,
  with the one exception that a member may read their own full record
- `GET /api/activity`: a plain read of `activity_events`, with the `family`
  filter mapped exhaustively from `kind`. An unmapped kind is a bug that fails
  loudly, not a row that quietly lands in `access`
- `GET /api/mail/health` and its diagnosis ladder, `base_url_unset` first
  because it is the loudest
- Setting `public.base_url` requeuing rows that failed on it, younger than seven
  days, recomposing only their absolute link fields
- The `invitation` email, whose count is **the invitee's own prospective
  visible count**, computable before they ever sign in because their role and
  groups are set at invite
- `invitation-lapse` given its real body

**Out, and owned by a later step:**

- Surfaces 11, 12, 13, 17 and 18 (step 9)
- Ordinary sign-in (step 3a, finished). The one-time initial admin session
  and setup redirects are the narrow exception introduced here.

## Interfaces this step produces

- `@memory-shoebox/shared`: the administration slice's schemas and
  notifications Part 2's, including first-run setup requests/responses, `PresenceRow`, `ActivityEntryDto`,
  `MailHealthResponse`, `MailQueueHealth` and `MailDeliveryFailure`

## Interfaces this step consumes

From step 3a: the request context, the visibility predicate, the
`visibilityGeneration` bump.
From step 2: the mail queue, the job runner.
From step 5a: the item delete transaction, which removing a member touches.
From steps 3b and 4b: the Mantine theme, signed-out presentation, session
bootstrap and route guards. From step 7b: the existing upload entry point; its
manual acceptance is deferred, not repeated here.

## Do not ask the user about

| Topic                        | Owned by |
| ---------------------------- | -------- |
| Existing admin surfaces      | step 9   |
| Milestone/removal surfaces   | step 8b  |
| Milestones, removal requests | step 7a  |
| Uploading                    | step 6a  |
| The timeline query           | step 4a  |

## Verification

Automated results and the implementation decisions are retained in
[step-8a-verification.md](step-8a-verification.md). Final manual acceptance
remains deferred. The full
Auto review supersedes the historical one-wave review cap; no confirmed review
violation remains.

- `pnpm check` green
- First-run browser tests using a migrated, unseeded catalog: creation gives
  the first person the admin role and a real session; invitation and skip
  both land on `/` with upload available
- Setup tests for concurrent submissions, repeated submissions, rollback,
  stale setup tabs, reload during invitations, missing mail configuration,
  and a non-empty catalog containing only removed members
- Existing seeded deployments bypass setup, and ordinary unknown-address
  sign-in remains indistinguishable from known-address sign-in
- A test that the last admin cannot be demoted or removed, by either route
- A test that adding a member to a group retroactively grants them everything
  ever restricted to that group, and that removing them takes it away, with no
  sign-in in between. This is the most consequential invisible action in the
  product
- A test that deleting a group widens access where it appeared in an `except`
  rule, and that the confirmation token is rejected once the usage has changed
- A test that a revoked invitation cannot sign in, and that a lapsed one cannot
  either, through `invitation-lapse` rather than through a second check
- A test that a timezone change writes one `item_capture_date_changes` row per
  moved item, and that each is revertible
- A test that a non-admin gets `403` and not `404` on presence and activity,
  except on `GET /api/items/:itemId/viewers`, where an invisible item is `404`
  and the role check runs **after** the visibility check
- A test that `GET /api/activity` throws on an unmapped kind rather than
  defaulting
- The invitation email compared against its prototype state, with a count that
  is the invitee's own
