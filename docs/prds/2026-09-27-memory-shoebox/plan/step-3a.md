# Step 3a: Identity and access

> Historical source references. `reference/` and `@memory-shoebox/reference` below are historical shorthand for the retired surface package at commit `3e09157b`, not current paths or runnable instructions. Read that commit for the original source spelling. Product decisions remain binding; current implementation and acceptance are documented in `docs/web.md` and step 9 verification.

**Status:** done
**Parallel with:** 3b
**Depends on:** steps 1 and 2

Everything in Scope is implemented and every check in Verification passes,
including the by-hand one this step was held open for.

That check was the full "Arriving for the first time" flow, and it was blocked
on something this step could not supply: a real `RESEND_API_KEY` and a verified
sending domain, without which nobody had watched a code arrive. The email work
that followed removed the blocker rather than waiting for it. In fake email
mode the whole path runs exactly as it would in production and only the last
step differs, so the flow was run end to end: a code was requested, the message
was rendered to a PDF, the six digits were read off it by eye, and posting them
to `POST /api/auth/session` returned `201` with a session.

What that leaves untested is Resend itself, not this step. Whether a real
mailbox receives what we hand the provider is worth confirming once real
credentials exist, but it is a question about the provider and the sending
domain rather than about identity and access.

## What this step delivers

Everybody who can get in, and everything that decides what they can see. The
whole auth slice: sign-in codes, sessions, devices, a member's own account, and
the anonymous settings read the sign-in page needs. Plus the piece that is not
a route and matters more than any of them: **the visibility predicate**,
computed once per request by the middleware, and the `visibilityGeneration`
cache key that invalidates every viewer at once when a group changes.

**Done when:** somebody can type an address, receive a real code by email, sign
in, stay signed in on that device, see their devices, sign one out remotely and
watch it stop working on the next request. And when a test proves that adding a
member to a group changes what a _different_ member's predicate returns, without
either of them signing in again.

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
   before asking anything. `auth.md` ends with a `## Rulings` section that
   answers eight questions this step would otherwise raise. Ask the user only
   what the documents genuinely do not settle.
2. **Write the step design** at
   `docs/superpowers/specs/YYYY-MM-DD-identity-and-access-design.md`.
3. **`superpowers:writing-plans`** for the detailed implementation plan.
4. **`superpowers:subagent-driven-development`** to implement it.

## Read these first

| Document                                                                | What you need from it                                                                                                 |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/auth.md`           | **The whole file**, including its `## Rulings`. Eight routes, their types, their errors and their reasoning           |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/conventions.md`    | § The auth middleware and § The visibility predicate are this step's other half. Also § Errors and § Rate limits      |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/administration.md` | `GET /api/public-settings` only. It lives in that file and the sign-in page is what needs it                          |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/data-models.md`         | § `members`, § `sessions`, § `sign_in_codes`, § `groups` and `group_members`, § The evaluation, and Decisions 2 and 3 |
| `docs/PRODUCT.md`                                                       | § How it works: authentication, roles, visibility, groups. § Product principles 1 and 2                               |
| `docs/prds/2026-09-27-memory-shoebox/design-spec.md`                    | Surface 1's states and the "Arriving for the first time" flow, including where it fails                               |
| `reference/` surfaces `sign-in` and `account`                           | `/s/sign-in?state=email` and the rest. Every state, including `unknown`, which must be byte-identical to `sent`       |
| `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/notifications.md`  | § 1 `sign_in_code`: the trigger, the idempotency recipe, the recipient rule and the copy                              |

## Scope

**In:**

- Every route in `auth.md`: sign-in code request and resend, session create and
  delete, the account read and its name correction, the notification switches,
  the device list and device sign-out
- `GET /api/public-settings`, anonymous, serving only keys carrying
  `isPubliclyReadable`
- The `sign_in_code` email, end to end, using step 2's queue and renderer
- **The auth middleware**, complete: the `shoebox_session` cookie
  (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`), looked up in the database
  on **every** request, with the throttled slide that writes `last_used_at` and
  `expires_at` only when the remaining lifetime has moved by more than a day
- **The visibility predicate**, built once per request as one reusable
  expression, plus `visibleRuleIds` cached per
  `(memberId, visibilityGeneration)` and the bumps that invalidate it: any
  change to group membership, to a rule's subjects, or to a member's role
- The automatic resend when the third code attempt fails, and a `410` body that
  says a new code is on its way, because the copy promises it
- `DELETE /api/auth/session` answering `204` on a dead, expired or absent
  cookie. Signing out must never fail
- `session-sweep` and `sign-in-code-sweep` given real bodies

**Out, and owned by a later step:**

- Inviting anybody, changing a role, creating a group (step 8a). This step
  **reads** groups and roles; it does not let anybody change them
- Every surface. This is `apps/server` and `packages/shared` only (steps 3b, 4b)
- `GET /api/settings`, the admin-only one (step 8a)

## Interfaces this step produces

- The request context with a live `member`, `role` and `visibleRuleIds`
- The visibility predicate expression, which **every** later read route
  composes rather than rewrites. `conventions.md` says it once and it must be
  built once in code too: a count and its page cannot disagree if they share it
- `@memory-shoebox/shared`: the auth slice's request and response schemas,
  including `CreateSessionResponse` with `isFirstSignIn` and the three resolved
  settings the shell needs
- The `visibilityGeneration` bump helper, which steps 5a, 6a and 8a call

## Interfaces this step consumes

From step 1: the schema, the frozen DTOs, `SETTING_DEFINITIONS`.
From step 2: the request context shape, the error handler, the rate limiter, the
mail queue and its renderer.

## Do not ask the user about

| Topic                                              | Owned by        |
| -------------------------------------------------- | --------------- |
| Inviting members, roles, groups, instance settings | step 8a         |
| Anything drawn on a screen                         | steps 3b and 4b |
| The timeline query, filters, the seen latch        | step 4a         |
| Comments, reactions, item visibility               | step 5a         |
| Uploads                                            | step 6a         |

## Verification

- `pnpm check` green
- The full "Arriving for the first time" flow from `design-spec.md`, run by
  hand against a real inbox, including `wrong`, `expired` and `resent`
- A test that an **unknown** address produces a response byte-identical to a
  known one: same status, same body, same timing class. The sign-in form must
  not be usable to discover who is a member
- A test that signing a device out stops it working on its **next** request,
  which is what rules out a stateless token and any cache without invalidation
- A test that adding member B to a group changes what B's `visibleRuleIds`
  returns without B signing in again, and that member A's cache is invalidated
  by the same bump
- A test that the session slide writes at most once per session per day under a
  hundred consecutive requests. Without the throttle, one page of thumbnails is
  dozens of writes serialising on SQLite's single writer
