# Signing in, sessions and visibility

Everybody who can get in, and everything that decides what they can see. The
routes are specified in
[`tech-specs/apis/auth.md`](prds/2026-09-27-memory-shoebox/tech-specs/apis/auth.md);
this file says how they fit together and why the shapes are what they are. The
code is `apps/server/src/auth/`, `apps/server/src/members/` and
`apps/server/src/visibility/`, with the routes in `src/routes/auth.ts`,
`src/routes/me.ts` and `src/routes/publicSettings.ts`.

## There is no password, and no account to make

A member types their address, receives six digits, and types those in. Both
halves of that are deliberate:

- **An invitation carries no credential.** It names the address and points at
  the sign-in page. Acceptance is the first successful sign-in after that
  invitation, so a forwarded invitation grants nothing (Decision 2).
- **`members.status` alone decides whether an address may sign in.** A revoked
  invitation, a lapsed one and a removed member are all `removed`, which is one
  question rather than three.

## The form cannot be used to find out who is a member

`POST /api/auth/sign-in-codes` writes a `sign_in_codes` row for **any**
address, member or not, and answers `202` with the same body either way. Only
the mail differs, and mail is queued rather than sent in band, so a provider
timeout cannot lengthen one branch.

That has to hold through the later states too, which is why the unknown
address gets a real row with a real hash: it counts down from three tries and
expires after ten minutes exactly as a member's does, and a correct guess
against it is refused the same way a wrong one is.

The rate limiter keys on the normalised address whether or not it belongs to
anybody. Counting only members would make the limiter itself the oracle.

## The code

Six digits from a CSPRNG, stored as `HMAC-SHA256(digits, pepper)`. Six digits
is a space of a million, so a bare digest is reversed instantly with a rainbow
table; the pepper is derived from `SESSION_SECRET` and lives only in the
process, so a copied database file is worth nothing during the ten minutes a
code is alive.

Every mint supersedes whatever was live for that address, so at most one code
exists per address and "the old one has stopped working" is a state on the row
rather than an inference from expiry. `mintSignInCode` is the one helper all
three callers share: the request route, the resend route, and the third wrong
attempt.

Redemption is one `BEGIN IMMEDIATE` transaction. Kysely's deferred `BEGIN`
would let two submissions each read `attempts = 0`, and each would get three
tries. The third wrong attempt invalidates the code and mints a replacement,
because the interface promises one: "Two tries left before we send you a new
one".

A successful redemption activates invited membership and accepts its pending
invitation, including when a removed identity has been invited back. This is
independent of the first-ever sign-in: returning members keep their historical
`joined_at` and item-view history, and do not seed newer items as already seen.
Every successful sign-in updates `last_signed_in_at`; archive seeding and the
initial join timestamp happen only when `joined_at` was null. Invitation expiry
remains the lapse job's responsibility through member status, with no second
expiry check in authentication.

`redeemSignInCode` **returns** its outcome rather than throwing it, and the
route turns each outcome into an `ApiError`. A throw inside the transaction
would roll the attempt increment back, and a wrong code that does not count
down never reaches "two tries left".

## The session

A cookie called `shoebox_session` carrying 256 bits of CSPRNG output, whose
SHA-256 is a row in `sessions`. Nothing is signed and nothing is encrypted,
because there is nothing in the value to protect: it means only what the row
says it means.

**It is looked up in the database on every request.** My account and Members
both promise that a signed-out device stops working immediately, wherever it
is, and that promise is the whole architecture: no stateless token, and no
cache without an invalidation channel. The lookup joins `members` and requires
`status = 'active'`, so removed membership is independently refused even if an old device row
remains. Administrative removal, invitation revocation and the lapse job also
delete every session and group membership atomically, with visibility
invalidation. A previously issued correct code cannot reopen removed membership.

The row's `last_used_at` and `expires_at` slide, but only when the remaining
lifetime has moved by more than a day, and `members.last_seen_at` is throttled
the same way. Without that, one page of thumbnails is dozens of writes
serialising on SQLite's single writer. The visible consequence is that a device
can read "29 days left" immediately after being used, which is correct rather
than stale.

A device's label is parsed out of the `User-Agent` once, at sign-in, and stored
on the row, so an upgraded parser never relabels a device somebody already
recognises. The raw header is kept beside it as the fallback and never leaves
the database.

Signing out is the one route that may not refuse: a dead, expired or absent
cookie still gets the clearing header, because a person pressing "sign out" and
being told they are not signed in has been failed by the software.

## The visibility predicate

Computed once per request by the middleware and composed by every read route
rather than rewritten:

- `getVisibleRuleIdsFromMemberId` expands the viewer's groups and the rules
  those groups and they are named by, in one query.
- `applyVisibilityFilter` and `visibilityExpression`, in one module, are the
  only sanctioned readers of that list. Both add
  `visibility_rule_id IN (...) OR uploaded_by = :me`, and for an admin they add
  nothing that restricts anything.

There are two of them because the predicate has two homes. A `WHERE` over
`items` takes the filter. **A left join to `items` has to take the expression
in its `ON` clause**, which is the people directory's case: the same predicate
in that query's `WHERE` turns the left join into an inner one and everybody
with no visible photograph disappears from the directory, silently, and no
fixture where every person has a visible photograph shows it. That is also why
an admin gets the literal `true` from the expression rather than nothing at
all: an absent `WHERE` restricts nothing, but an absent `ON` condition changes
which rows a join matches.

Two rules that are easy to break and hard to notice: `item_people` may never
appear in a visibility expression, because being in a photograph is not a key
to it; and no count that visibility can filter may ever be stored.

`applyVisibilityFilter` and `visibilityExpression` ship with tests and **no
production caller**. There is nothing to read yet: their callers are the steps
that write visibility and read the archive. The expansion behind them is
already live, because the middleware runs it on every request.

## The generation, and what has to bump it

`visibleRuleIds` is cached per `(memberId, visibilityGeneration)`, in the
process, which is sound only because the deployment is one machine. A
generation that has moved empties the whole cache, so a group edit invalidates
every viewer at once. The generation itself is read per request rather than
cached: it is one row by primary key beside a lookup that is already happening,
and caching it is how "a group edit invalidates every viewer at once" quietly
stops being true.

`bumpVisibilityGeneration` must be called, inside the same transaction, by
every write that can change what an expansion returns: group membership, a
rule's subjects, a member's role, removal/revocation/lapse cleanup, and **the insert of a new rule**. The last is
the quiet one: a new rule naming a viewer is not in that viewer's cached set,
so a brand-new upload would be invisible to them until something unrelated
bumped.

A display name change does not bump, and should not: invalidating every cache
because somebody fixed their own spelling costs something and buys nothing.

## What this slice deliberately cannot tell you

- Whether an address is a member, invited, or suppressed. There is no route
  that answers it and no slice may add one.
- Why a sign-in email did not arrive. A failure lands in `outbound_emails` and
  surfaces only in the admin's mail banner.
- How many items a brand-new member's archive holds. The first sign-in seeds
  `item_views` for every existing item so the accent dot means "arrived since
  you joined", and the response says nothing about how many rows that was.
