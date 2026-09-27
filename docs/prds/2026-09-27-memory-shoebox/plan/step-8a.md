# Step 8a: Administration and the admin's read surfaces

**Status:** not started
**Parallel with:** 8b
**Depends on:** steps 1, 2, 3a and 5a

## What this step delivers

The last backend slice and the last of the email contract. Members and
invitations, groups, instance settings, and the three admin reads: who has been
looking, what has been changed, and whether mail is going out at all.

**Done when:** an admin can invite somebody who then signs in, change a role,
build a group and watch it change what a member can see, rename the Shoebox,
change its timezone and watch the affected days move, and open a diagnosis when
mail stops.

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

| Document                                                                      | What you need from it                                                                                                                               |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/administration.md`       | **The whole file**, including its `## Rulings`. Eighteen routes, the largest slice                                                                  |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/notifications.md`        | **Part 2 entirely**: presence, item viewers, activity, mail health. Plus § 2 `invitation`, whose copy this step owns                                |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/data-models.md`               | § `members`, § `invitations`, § `groups`, § `settings`, § `activity_events`, § `item_views`, § Privacy, § The last admin, Decisions 1, 2, 11 and 17 |
| `docs/prds/2026-09-27-memory-shoebox/design-spec.md`                          | Surfaces 11, 12, 13, 17 and 18 and their states                                                                                                     |
| `prototypes/` surfaces `settings`, `members`, `groups`, `presence`, `changes` | Every state. `mail-failing`, `last-admin`, `delete-used` and `gone` are the four that carry the most rules                                          |
| `prototypes/` surface `emails`, state `invitation`                            | The message this step sends                                                                                                                         |
| `docs/PRODUCT.md`                                                             | § How it works: roles, groups, invitations. § Product principle 1, private by construction                                                          |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md`          | § `SETTING_DEFINITIONS`, § Rate limits (the invitation resend row is new), § The three documented exceptions                                        |

## Scope

**In:**

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
- Sign-in itself (step 3a, finished)

## Interfaces this step produces

- `@memory-shoebox/shared`: the administration slice's schemas and
  notifications Part 2's, including `PresenceRow`, `ActivityEntryDto`,
  `MailHealthResponse`, `MailQueueHealth` and `MailDeliveryFailure`

## Interfaces this step consumes

From step 3a: the request context, the visibility predicate, the
`visibilityGeneration` bump.
From step 2: the mail queue, the job runner.
From step 5a: the item delete transaction, which removing a member touches.

## Do not ask the user about

| Topic                        | Owned by       |
| ---------------------------- | -------------- |
| Any surface                  | steps 8b and 9 |
| Milestones, removal requests | step 7a        |
| Uploading                    | step 6a        |
| The timeline query           | step 4a        |

## Verification

- `pnpm check` green
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
