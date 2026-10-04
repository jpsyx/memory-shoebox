# Step 7a: Milestones and removals

**Status:** complete (2026-10-03)
**Parallel with:** 7b
**Depends on:** steps 1, 2, 3a, 4a and 5a

## What this step delivers

Two backend slices that share no tables and can be built in either order inside
one session. Milestones: the dated occasion, its span, attachment, and the
reconciliation of photographs captured outside it. Removals: asking for a
photograph to come down, and the three ways that ends, plus the weekly reminder
that makes sure it ends at all.

This step also owns the five removal emails, which are most of the product's
mail and the ones where the copy is the feature.

**Done when:** an uploader can create an occasion from nothing and find its
photographs, or create one from a selection; a member tagged in a photograph can
ask for it to come down; the uploader and every admin are told, and told again
weekly until somebody acts; and each of delete, decline and withdraw closes the
loop with the right people.

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
   before asking anything. Both slice files end with a `## Rulings` section:
   four in `milestones.md` and six in `removals.md`. Ask the user only what
   they genuinely do not settle.
2. **Write the step design** at
   `docs/superpowers/specs/YYYY-MM-DD-milestones-and-removals-design.md`.
3. **`superpowers:writing-plans`** for the detailed implementation plan.
4. **`superpowers:subagent-driven-development`** to implement it.

## Read these first

| Document                                                               | What you need from it                                                                                                         |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/milestones.md`    | **The whole file**, including its `## Rulings`. Nine routes                                                                   |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/removals.md`      | **The whole file**, including its `## Rulings`. Five routes, and the tag gate that decides who may ask                        |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/notifications.md` | §§ 5 to 9: `removal_request`, `removal_reminder`, and `removal_resolved` in all three outcomes. This step owns that copy      |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/data-models.md`        | § `milestones`, § `item_milestones`, § `removal_requests`, § `item_capture_date_changes`, Decisions 5, 10 and 12              |
| `docs/prds/2026-09-27-memory-shoebox/design-spec.md`                   | Surfaces 10, 14 and 15, and the "Asking for a photograph to come down" flow including where it stops early and where it fails |
| `prototypes/` surfaces `milestones`, `removal`, `removal-requests`     | Every state                                                                                                                   |
| `prototypes/` surface `emails`, the five removal states                | `removal-request`, `removal-reminder`, `removal-gone`, `removal-declined`, `removal-withdrawn`                                |
| `docs/PRODUCT.md`                                                      | § How it works: milestones, deletion, asking for something to come down                                                       |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md`   | § Errors, in particular that 403 covers capability as well as role, which the tag gate relies on                              |

## Scope

**In:**

- Every route in `milestones.md`, with `PATCH /:milestoneId/items` applying a
  delta in both directions rather than replacing a set
- The attach picker driving from `GET /api/timeline`'s
  `attachedToMilestoneId` flag, which step 4a delivered, rather than
  reinventing the filter query language here
- Ejection from a burst when a reconcile moves an item off its burst's day,
  and dropping the burst row if that empties it
- Every route in `removals.md`, including withdraw, which only the requester
  may call: the role token is `self`, not `self-or-admin`
- The tag gate, written once here, whose result step 5a already exposes as
  `capabilities.canRequestRemoval`
- All five removal emails, each enqueued in the same transaction as its state
  change, each keyed per recipient
- `removal-reminder` given its real body: a blind
  `INSERT ... ON CONFLICT DO NOTHING` with
  `week_index = floor((now - created_at) / 7 days)` and `week_index >= 1`, so
  two reminders in one week are arithmetically impossible and there is no
  scheduler state to drift
- The reason and decline-reason caps, both 4000, from
  `conventions.md` § String lengths

**Out, and owned by a later step:**

- Surfaces 10, 14 and 15 (step 8b)
- Deleting an item, which step 5a owns. This step calls it
- Members, groups, settings (step 8a)

## Interfaces this step produces

- `@memory-shoebox/shared`: both slices' schemas, including
  `RemovalRequestDto` with its per-viewer `canWithdraw`, `canDecline` and
  `canDeleteItem`
- The tag gate predicate

## Interfaces this step consumes

From step 5a: the item delete transaction and `ItemCapabilities`.
From step 4a: the timeline query and its `attachedToMilestoneId` flag.
From step 2: the mail queue and the job runner.
From step 3a: the request context and the visibility predicate.

## Do not ask the user about

| Topic                                  | Owned by     |
| -------------------------------------- | ------------ |
| Any surface                            | steps 7b, 8b |
| Members, invitations, groups, settings | step 8a      |
| Presence, the change log, mail health  | step 8a      |
| The upload surface                     | step 7b      |

## Verification

- `pnpm check` green
- A test that a request resolves exactly once, enforced by
  `CHECK ((state = 'open') = (resolved_at IS NULL))` rather than by application
  code, and that a second attempt gets `409 removal_request_not_open`
- A test that an admin cannot withdraw somebody else's request, and that the
  uploader cannot either
- A test that a withdrawal emails the uploader and the admins **minus the
  actor**, and that delete and decline email the requester
- A test that the requester's `removal_resolved` is not suppressible by
  `notify_on_removal`, and that the withdrawal one is
- A test that the reminder cannot fire twice in a week no matter how often the
  hourly job runs, and that it stops the moment the request leaves `open`
- A test that detaching items a viewer cannot see is impossible through
  `PATCH /:milestoneId/items`, because it takes a delta
- All five emails compared against their prototype states, in both the rendered
  and plain-text forms. The decline carries the decliner's **own words**,
  quoted and leading, never a template

## Completion evidence

All nine milestone routes and five removal routes are registered. The integrated
lifecycle in `apps/server/test/routes/step7a.integration.test.ts` creates an empty
multi-day occasion, attaches a candidate, moves a mismatch, checks timeline
attachment filters, runs a deduplicated reminder, declines and asks again,
withdraws and asks again, then deletes as admin. Shared schemas validate every
JSON response and stored mail payload; the real registry renders all five
message bodies. The occasion and all settled requests survive deletion, with
null item IDs and no open request. The expected thirteen per-recipient mail
keys also verify recipient and preference rules across the lifecycle.

`pnpm check` passed on the completed backend behavior. Focused tests cover SQL
state/timestamp consistency, second-resolution conflicts, proxy-withdrawal
refusals, preference bypass, weekly keys, invisible detachment rollback and
prototype copy in HTML and plain text. The SQL CHECK enforces row consistency;
conditional open-state updates enforce transition history. Visual email
inspection and detailed command evidence are recorded in the Step 7a SDD task
reports. The five bodies' saved renders include phone and desktop screenshots.

The approved rulings remain: milestone names use the shared 200-character cap;
any visible tagged member may ask; timeline bands rank globally across filters
and pages; reminder age follows Shoebox local calendar weeks. Surfaces remain
owned by step 8b.
