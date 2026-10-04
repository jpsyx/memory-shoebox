# Administration

Members, invitations, groups and Shoebox settings: the three admin surfaces
that decide who may open this Shoebox, what each of them can do, and what the
deployment itself is called. Everything here is governed by
[`conventions.md`](conventions.md), which wins over anything below.

**Not here.** A member's own account, their own email preferences and their own
devices (agent A, whose `SessionDto` is canonical and is reused unchanged by
the one route below that lists sessions). Mail health, the sending test, the
domain re-check and the activity log (agent H). Visibility rules for items,
including `POST /api/visibility-rules/resolve` (agent C); this slice reads
`visibility_rules` and `visibility_rule_subjects` only to say what deleting a
group would do, and rewrites them only inside `DELETE /api/groups/:groupId`.
Milestone reconciliation after a capture date moves (agent D). Sign-in,
sign-out and invitation acceptance (agent B).

**One thing to read before the routes.** `members` and `groups` rows carry no
visibility predicate: every member can already see every other member's name,
because the visibility picker and the reaction popover are built out of those
names. So the absolute 404 rule in `conventions.md` has nothing to bite on
here, and the refusals in this slice are **role** refusals, which are `403` by
definition ("signed in, the thing exists, the viewer may see it, their role
forbids the action"). This is one of the few slices where `403` is the right
answer, and it is right precisely because nothing in it is visibility-filtered.
The one exception is a mismatched `(memberId, sessionId)` pair, which is a
`404` because the pair does not exist.

## Routes

| Method   | Path                                         | Auth          | Role                  | Purpose                                                         |
| -------- | -------------------------------------------- | ------------- | --------------------- | --------------------------------------------------------------- |
| `GET`    | `/api/members`                               | session       | viewer (two shapes)   | The member list: full for an admin, names only for anybody else |
| `POST`   | `/api/members`                               | session       | admin                 | Invite an address, reusing a removed member's row               |
| `PATCH`  | `/api/members/:memberId`                     | session       | admin                 | Change a role, guarded by the last-admin recount                |
| `DELETE` | `/api/members/:memberId`                     | session       | admin                 | Remove a member, which is a status change, never a delete       |
| `POST`   | `/api/members/:memberId/invitation/resend`   | session       | admin                 | Send the invitation again                                       |
| `DELETE` | `/api/members/:memberId/invitation`          | session       | admin                 | Revoke an invitation, which also closes the account             |
| `DELETE` | `/api/members/:memberId/sessions/:sessionId` | session       | admin                 | Sign out somebody else's device                                 |
| `GET`    | `/api/member-suggestions`                    | session       | admin                 | Pre-fill the invite form's name from the people directory       |
| `GET`    | `/api/public-settings`                       | **anonymous** | none                  | The allow-listed settings the sign-in page needs                |
| `GET`    | `/api/groups`                                | session       | uploader (two shapes) | The groups: full for an admin, name and id for an uploader      |
| `POST`   | `/api/groups`                                | session       | admin                 | Create a group, optionally with its members                     |
| `PATCH`  | `/api/groups/:groupId`                       | session       | admin                 | Rename a group                                                  |
| `PUT`    | `/api/groups/:groupId/members`               | session       | admin                 | Replace the membership set                                      |
| `GET`    | `/api/groups/:groupId/usage`                 | session       | admin                 | What deleting this group would do, in both directions           |
| `DELETE` | `/api/groups/:groupId`                       | session       | admin                 | Delete a group and rewrite the rules that named it              |
| `GET`    | `/api/settings`                              | session       | admin                 | Instance settings, resolved against the registry defaults       |
| `PATCH`  | `/api/settings`                              | session       | admin                 | Change them, or preview what a change would move                |

`GET /api/member-suggestions` is not in the coordinator's expected set. It is
the pre-fill lookup Decision 1 requires and it is raised in "Rulings".

---

## Members

#### `GET /api/members`

**Surface** 12 `members`, states `list`, `invite`, `pending`, `change-role`,
`last-admin`, `remove`, `devices`. Also the source of names for the visibility
picker (surfaces 8 and 4) and the reaction popover (surfaces 4 and 5).
**Auth** session required · **Role** viewer

**This is one route with two shapes, and there is no second route.** An admin
gets the administrative row: address, role, status, the three timestamps, the
live invitation and every device currently holding a session. Any other member
gets `MemberRef` and nothing else, because the picker and the popover need
names and a viewer has no business knowing who signed in yesterday. The shape
is chosen by `viewer.isAdmin`, never by a query parameter, so there is no way
to ask for the wrong one.

```ts
type MemberRole = "viewer" | "uploader" | "admin";
type MemberStatus = "invited" | "active" | "removed";
```

**Request**

```ts
type ListMembersRequest = {
  /**
   * Query, repeatable. Admin only. Defaults to `["invited", "active"]`.
   * A non-admin who sends it gets 403: the filter is an admin capability,
   * and silently ignoring it would let a viewer believe they had filtered.
   */
  status?: MemberStatus[];
};
```

No `limit` and no `cursor`, and none are accepted. The member table is tens of
rows and will not grow (`data-models.md` § Scale), so the route is unpaginated
and `nextCursor` is always `null`. The envelope keeps the field because
`conventions.md` § Envelope requires it on every collection.

**Response** `200`

```ts
type AdminMemberDto = {
  memberId: string;
  /**
   * Resolved, never null: the stored name, else the email local part. Decision
   * 1.
   */
  displayName: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  /** First successful sign-in, ever. Survives a removal and a re-invitation. */
  joinedAt: string | null;
  lastSignedInAt: string | null;
  /** The Members table's "Last seen". Throttled to roughly one write a day. */
  lastSeenAt: string | null;
  removedAt: string | null;
  createdAt: string;
  /**
   * The most recent `invitations` row, live or spent. Null if never invited
   * through this route.
   */
  invitation: MemberInvitationDto | null;
  /**
   * Every session this member currently holds. Empty for an invited or removed
   * member.
   */
  sessions: SessionDto[];
  /**
   * True when this member is an admin and the only *active* one. Drives the
   * copy in the change-role and remove dialogs so the reason is stated before
   * the round trip. The server still enforces it in the transaction; this flag
   * is advisory and a client must not treat its absence as permission.
   */
  isLastActiveAdmin: boolean;
};

type ListMembersResponse =
  | {
      shape: "admin";
      members: AdminMemberDto[];
      nextCursor: null;
      /**
       * `status = 'active' AND role = 'admin'`. Invited admins are not counted.
       */
      activeAdminCount: number;
    }
  | {
      shape: "directory";
      members: MemberRef[];
      nextCursor: null;
    };
```

`SessionDto` is agent A's, reused unchanged. This route relies on `sessionId`,
`deviceLabel`, `lastUsedAt` and `expiresAt`; `isCurrent` is true only on the
requesting admin's own row. No IP address, no location and no raw user agent
appear, here or anywhere (`conventions.md` § Forbidden in any payload,
Decision 6).

**The exact field diff**

| Field                                      | admin | directory |
| ------------------------------------------ | :---: | :-------: |
| `memberId`, `displayName`                  |   ✓   |     ✓     |
| `email`                                    |   ✓   |           |
| `role`, `status`                           |   ✓   |           |
| `joinedAt`, `lastSignedInAt`, `lastSeenAt` |   ✓   |           |
| `removedAt`, `createdAt`                   |   ✓   |           |
| `invitation`                               |   ✓   |           |
| `sessions`                                 |   ✓   |           |
| `isLastActiveAdmin`, `activeAdminCount`    |   ✓   |           |

The directory shape is exactly the frozen `MemberRef` and adds nothing. Its
comment in `conventions.md` ("No email unless the route is admin-scoped") is
the whole rule.

**Errors**

| Status | Code                | When                                    |
| ------ | ------------------- | --------------------------------------- |
| 400    | `invalid_request`   | `status` is not one of the three values |
| 401    | `not_signed_in`     | No session, or an expired one           |
| 403    | `members_forbidden` | A non-admin sent `status`               |

**Transformations**

- `displayName` resolves `members.display_name`, falling back to the email
  local part, before the DTO is built, which is why `MemberRef.displayName` is
  `string` and not `string | null` (Decision 1).
- `Member.lastSeen` ("Today") and `Device.lastUsed` ("3 days ago") in the
  fixtures are formatted strings and must not cross the wire. The timestamps
  go; the browser formats, in the reader's locale
  (`data-models.md` § Notes for whoever writes the API contract).
- `isLastActiveAdmin` is `row.role === "admin" && row.status === "active" && activeAdminCount === 1`.
- `invitation.isPending` is computed against the server clock, not the client's.
- `activeAdminCount` is not a visibility-filtered count. Member rows carry no
  visibility predicate, so the "every count is per viewer" rule
  (`data-models.md` § One rule that outranks the others) has nothing to filter
  here. It is stated so nobody later reads the `Count` suffix as a licence to
  store one.

**Performance**

Three queries, never more. One over `members` (nine rows). One over `sessions`
with `member_id IN (...)`, served by `(member_id, last_used_at DESC)`. One over
`invitations` taking the latest row per member, served by an index on
`(member_id, created_at DESC)`. Grouping the sessions and invitations in the
application is a nine-way bucket sort. **A session query per member row is the
N+1 to refuse**: it is the obvious way to write the `devices` state and it is
one query per member on a page that already has the member list in hand.

---

#### `POST /api/members`

**Surface** 12 `members`, states `invite`, `pending`
**Auth** session required · **Role** admin

**Request**

```ts
type InviteMemberRequest = {
  /** Body. Normalised (trimmed, lowercased) before anything else happens. */
  email: string;
  /**
   * Body, optional. Pre-filled by the client from `GET
   * /api/member-suggestions`. Null or absent leaves `display_name` null, and
   * the email local part is served in its place until the member corrects it in
   * My account. Decision 1.
   */
  displayName?: string | null;
  /** Body. The offered role. There is no `role` column on `invitations`. */
  role: MemberRole;
};
```

**Response** `201` `AdminMemberDto`

**The reuse path, which is what makes the promise true.** `members.email` is
globally unique and a member row is never hard-deleted, so an address is either
free or already claimed:

| Existing row for this address | Behaviour                                                                                                                                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| None                          | Insert a `members` row with `status = 'invited'` and the offered role, then an `invitations` row.                                                                                                                 |
| `status = 'removed'`          | **Reuse it.** Set `status = 'invited'`, clear `removed_at`, write the offered role, overwrite `display_name` only when one was supplied. Insert a new `invitations` row (`member_id` is deliberately not unique). |
| `status = 'invited'`          | `409 members_invitation_pending`, with `details.memberId` so the surface can send the admin to that row's "Send it again".                                                                                        |
| `status = 'active'`           | `409 members_already_active`, with `details.memberId`.                                                                                                                                                            |

On the reuse path `joined_at` and `last_signed_in_at` are left exactly as they
were: they record the first sign-in ever, and preserving them is literally what
"inviting them back later picks up where this left off" means. Nothing else is
touched, so every item they uploaded, every comment they wrote, every
`item_people` row naming them and every `visibility_rule_subjects` row naming
them is still there and still theirs. There is no field on the response saying
a row was reused; `createdAt` predating `invitation.createdAt` is the tell, and
adding a flag would be a second source of truth.

**The invitation carries no credential.** Decision 2. The email names the
address, links to a join page, and says a six-digit code will be emailed when
you get there. The join link carries the address as a plain query parameter so
the field arrives pre-filled, which is an address, not a credential. There is
no token, no `consumed_at` and no attempt cap on `invitations`, because there
is nothing to consume or guess; `sign_in_codes` carries both, for the code.
**The Members mockup's banner is wrong** and says the invitation holds a
six-digit code; the copy changes, and no field in this contract backs the old
claim.

**Errors**

| Status | Code                         | When                                             |
| ------ | ---------------------------- | ------------------------------------------------ |
| 400    | `invalid_request`            | Malformed address, or a `role` outside the three |
| 401    | `not_signed_in`              |                                                  |
| 403    | `members_forbidden`          | The caller is not an admin                       |
| 409    | `members_already_active`     | The address belongs to an active member          |
| 409    | `members_invitation_pending` | The address already has a live invitation        |
| 429    | `rate_limited`               |                                                  |

**Transformations**

- Email normalisation happens on write, in application code, not by a
  collation: `COLLATE NOCASE` is ASCII-only and mishandles a non-ASCII address
  (`data-models.md` § Conventions).
- `invitations.expires_at` is seven days out, and the email states it.
- Enqueues one `outbound_emails` row, `kind = 'invitation'`, idempotency key
  `invite:<invitation_id>:<send_count>` (`data-models.md` § `outbound_emails`).
  The mail itself is agent H's.
- Writes `activity_events` `member_invited`.
- **No `visibilityGeneration` bump.** A newly invited member belongs to no
  group and has no cached rule set, and their role grants them nothing until
  they sign in. Nobody else's visible rule set moves.

**Performance** One indexed lookup on `UNIQUE (email)`, then two or three
single-row writes in one transaction. The whole thing is nine rows' worth of
table.

---

#### `GET /api/public-settings`

**Surface** 1 `signin`, every state (the Shoebox name in the top bar)
**Auth** **anonymous** · **Role** none

Surface 1 renders `shoebox.name` before anybody is signed in, and
`GET /api/settings` cannot serve it: that route is admin-only because it also
carries the mail configuration and the storage figures. The auth slice raised
the same need from the other side.

**Request** none.

**Response** `200`

```ts
type PublicSettingsResponse = {
  shoeboxName: string;
  /** Absolute, from `public.base_url`. Null before first-run setup. */
  baseUrl: string | null;
};
```

**The allow-list is the guard, not the handler.** `SETTING_DEFINITIONS`
(`conventions.md`) gains an `isPubliclyReadable` flag, true today for
`shoebox.name` and `public.base_url` and false for everything else, and this
route serves exactly the keys carrying it. A key is readable anonymously
because it is on that list, never because a route forgot to check, which is the
difference between a rule and a habit.

**This is a fingerprint, not an oracle.** Anybody who can reach the instance
learns what it calls itself, which is the same thing the sign-in page shows
them anyway. It reveals no member, no address, no count and no content, and it
is not a membership oracle: surface 1's `unknown` state is byte-identical to
`sent` precisely so the form cannot be used to discover who is a member, and
this route does nothing to weaken that.

**What a signed-in member needs is a different question**, answered elsewhere.
`shoebox.name`, `pile.arrangement` and `shoebox.timezone` ride on
`CreateSessionResponse` as resolved values, because they are session bootstrap
rather than a second fetch, and `pile.arrangement` in particular must not
become anonymously readable.

**Errors** none beyond a malformed request. There is no 401, by definition, and
no 404: a Shoebox with no `shoebox.name` row set serves the default from
`SETTING_DEFINITIONS`, which is what lets a fresh instance hold zero settings
rows and still render.

**Performance** one indexed read of at most two rows, and it is cacheable for a
minute at the edge of the handler. It is the only route an unauthenticated
visitor can call repeatedly, so it takes the per-IP bucket in
`conventions.md` § Rate limits.

---

#### `GET /api/member-suggestions`

**Surface** 12 `members`, state `invite` (the "What to call them" field)
**Auth** session required · **Role** admin

The pre-fill Decision 1 requires: "inviting a grandmother the archive already
knows offers her name back". The archive knows her as a `people` row with 41
items, and a `people` row has no address, so the only thing to match on is the
address itself.

**Request**

```ts
type ListMemberSuggestionsRequest = {
  /** Query. The address the admin has typed so far. */
  email: string;
};
```

**Response** `200`

```ts
type MemberSuggestionDto = {
  /**
   * Frozen DTO. Never carries a memberId: a tagged person is not an account.
   */
  person: PersonRef;
  /** How many items name this person. Admin-scoped, so unfiltered. */
  itemCount: number;
};

type ListMemberSuggestionsResponse = {
  suggestions: MemberSuggestionDto[];
  nextCursor: null;
};
```

**The lookup.** Take the local part of the normalised address, strip a `+`
suffix, split on `.`, `_`, `-` and digits, and match the resulting tokens
against normalized `people.display_name` (trimmed, lowercased,
whitespace-collapsed, NFC, the same normalization `tags` uses). The actual
people schema has no normalized column, so the server folds the small people
directory with the canonical JavaScript helper before selecting matching IDs. A person matches when any token is a
whole word of their normalised name. Order by `itemCount DESC`, cap at five,
and return an empty list rather than guessing when nothing matches. The client
pre-fills from the first suggestion and leaves the field editable, because the
copy says "Type over it if it is wrong".

**Errors**

| Status | Code                | When                         |
| ------ | ------------------- | ---------------------------- |
| 400    | `invalid_request`   | `email` missing or malformed |
| 401    | `not_signed_in`     |                              |
| 403    | `members_forbidden` | The caller is not an admin   |

**Transformations** `itemCount` is the unfiltered total because an admin's
visibility is absolute (`PRODUCT.md` § Roles), so the per-viewer count and the
total are the same number. This route must never be opened to a lower role, at
which point the count would have to be filtered and the suggestion would leak
how many restricted photographs name somebody.

**Performance** One directory name read, then matched `people` joined to a
grouped count over `item_people`, with `LIMIT 5` in SQL. That
join is ~100k rows at a decade's scale and is the same shape as the people
directory's, so it reuses that path. Cap at five in SQL, not in the client.

---

#### `PATCH /api/members/:memberId`

**Surface** 12 `members`, states `change-role`, `last-admin`
**Auth** session required · **Role** admin

**Request**

```ts
type ChangeMemberRoleRequest = {
  /** Path. */
  memberId: string;
  /** Body. */
  role: MemberRole;
};
```

**Response** `200` `AdminMemberDto`

**The last admin, which is the whole route.** Reading
`SELECT count(*) FROM members WHERE role = 'admin' AND status = 'active'`
outside a transaction lets two concurrent demotions each see two admins and
leave the Shoebox with zero, which is unrecoverable without shell access.
SQLite cannot express this as a constraint, so the handler does:

```
BEGIN IMMEDIATE
  UPDATE members SET role = :role WHERE id = :memberId
  SELECT count(*) FROM members WHERE role = 'admin' AND status = 'active'
  -- zero: ROLLBACK, respond 409 members_last_admin
COMMIT
```

`BEGIN IMMEDIATE` rather than a deferred transaction, because the write lock
has to be held from before the recount, not from the first write.

**An invited admin does not count.** The recount filters `status = 'active'`.
An invited admin cannot act, so counting them would let the only real admin
demote themselves and lock the Shoebox waiting on somebody who may never
accept. The corollary: demoting an _invited_ admin can never trip the guard,
and changing an invited member's role is allowed at any time, because
`members.role` is the single source of truth and an admin may change the
offered role before acceptance (`data-models.md` § `invitations`).

Any admin may change any role, including another admin's, and an admin may
demote themselves as long as they are not the last one. That is the mockup's
answer to open question 3 in the spec and this contract keeps it.

**Errors**

| Status | Code                 | When                                                                                                                           |
| ------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 400    | `invalid_request`    | `role` outside the three values                                                                                                |
| 401    | `not_signed_in`      |                                                                                                                                |
| 403    | `members_forbidden`  | The caller is not an admin. The row exists and its name is visible to everybody, so 403 is correct here and 404 would be wrong |
| 404    | `members_not_found`  | No member with that id                                                                                                         |
| 409    | `members_last_admin` | The recount came back zero. `details.activeAdminCount` is `0`                                                                  |
| 409    | `members_not_active` | The target is `removed`; re-invite instead                                                                                     |

**Transformations**

- Writes `activity_events` `member_role_changed`, with `detail_json` carrying
  the previous and the new role. `members.role` holds the current value only,
  so the log is the only record that a change happened at all
  (`data-models.md` § What is _not_ logged).
- **Bumps `visibilityGeneration`** in the same transaction. A role change is
  one of the three things that invalidate every cached `visibleRuleIds`, and it
  has to, because promoting somebody to admin makes the whole archive visible
  to them at once (`conventions.md` § The auth middleware).
- The bump is an upsert, not an update: a fresh instance holds **zero**
  settings rows, so
  `INSERT INTO settings (scope, key, value) VALUES ('instance', 'visibility.generation', 1) ON CONFLICT DO UPDATE SET value = value + 1`
  against the `settings__one_instance_value` partial index.

**Performance** Two single-row statements plus a nine-row count, inside one
immediate transaction. The transaction is short on purpose: SQLite has one
writer, and holding it open across the mail or the activity write would
serialise every other admin action.

---

#### `DELETE /api/members/:memberId`

**Surface** 12 `members`, state `remove`
**Auth** session required · **Role** admin

Removal is a **status change**. A member row is never hard-deleted, because
every authorship key in the product hangs off this id, and making removal a
status is what lets those keys be `RESTRICT` without the restriction ever
firing (`data-models.md` § `members`).

**Request**

```ts
type RemoveMemberRequest = {
  /** Path. */
  memberId: string;
};
```

**Response** `200` `AdminMemberDto`, with `status: "removed"`, `removedAt` set
and `sessions: []`. Not `204`: the point of the route is that the row survives,
and returning it says so.

**One transaction, in this order**

```
BEGIN IMMEDIATE
  UPDATE members SET status = 'removed', removed_at = :now WHERE id = :memberId
  DELETE FROM sessions      WHERE member_id = :memberId
  DELETE FROM group_members WHERE member_id = :memberId
  UPDATE invitations SET revoked_at = :now WHERE member_id = :memberId AND revoked_at IS NULL AND accepted_at IS NULL
  SELECT count(*) FROM members WHERE role = 'admin' AND status = 'active'
  -- zero: ROLLBACK, respond 409 members_last_admin
  -- bump visibility.generation
  -- insert activity_events member_removed
COMMIT
```

**The mockup guards demotion but not removal. This contract guards both.**
Removing the last active admin has the identical consequence to demoting them,
and the same recount under the same `BEGIN IMMEDIATE` covers it. Removing an
_invited_ admin can never trip it, for the same reason as above.

**Nothing else moves.** Not items, not comments, not reactions, not
`item_people`, not the linked `people` row. "Nothing they uploaded or wrote is
deleted, and their name stays on it" is a schema property, not a promise the
handler keeps by being careful.

Two consequences worth stating because they are invisible:

- `visibility_rule_subjects.member_id` is `ON DELETE CASCADE`, and because the
  row is never deleted, **that cascade never fires**. A removed member stays a
  named subject of every rule that named them, which is harmless (they cannot
  sign in) and is what keeps `subject_digest` stable. The data model's note
  that "deleting a member can make two previously distinct rules collide" is
  about a hard delete that this product never performs
  (`data-models.md` § What that costs).
- Deleting their `sessions` rows is what makes "loses access straight away, on
  every device" true, and it is only true because sessions are looked up in the
  database on every request (`conventions.md` § The auth middleware). Any cache
  without an invalidation channel breaks this promise silently.

**Removing yourself** is allowed, subject to the same recount. Your own session
rows go with everybody else's, so the response is the last thing that cookie
can read.

**Errors**

| Status | Code                      | When                                                                  |
| ------ | ------------------------- | --------------------------------------------------------------------- |
| 401    | `not_signed_in`           |                                                                       |
| 403    | `members_forbidden`       | The caller is not an admin                                            |
| 404    | `members_not_found`       | No member with that id                                                |
| 409    | `members_last_admin`      | The recount came back zero                                            |
| 409    | `members_already_removed` | Already `removed`. A double submit is a state conflict, not a success |

**Transformations**

- Writes one `activity_events` `member_removed`, with `detail_json` carrying
  the groups they were in and the number of sessions killed. One row, not one
  per group: `member_removed` already implies the memberships went, and the log
  has to read correctly with no join.
- **Bumps `visibilityGeneration`**, because their group memberships were
  deleted and because an admin removal changes the role landscape.
- Revokes any live invitation in the same transaction, so removing a pending
  invitee is a single action rather than revoke-then-remove.

**Performance** Four single-table writes and a nine-row count. `sessions` is
hit by `(member_id, last_used_at DESC)` and `group_members` by
`(member_id, group_id)`, which is the second-hottest index in the product and
is present for the visibility expansion rather than for this
(`data-models.md` § `groups` and `group_members`).

---

#### `POST /api/members/:memberId/invitation/resend`

**Surface** 12 `members`, states `pending`, `list` ("Send it again")
**Auth** session required · **Role** admin

**Request**

```ts
type ResendMemberInvitationRequest = {
  /** Path. */
  memberId: string;
};
```

**Response** `200` `AdminMemberDto`, with `invitation.sendCount` incremented
and `invitation.expiresAt` moved.

**Transformations**

- `UPDATE invitations SET send_count = send_count + 1, last_sent_at = :now, expires_at = :now + 7 days`
  on the member's live invitation. A resend restarts the seven days, because
  the banner and the email both state seven days and a resend that inherited
  the old expiry would be a lie in the copy.
- Enqueues one `outbound_emails` row, `kind = 'invitation'`, idempotency key
  `invite:<invitation_id>:<send_count>` **using the incremented count**, which
  is exactly why `send_count` is part of the recipe: without it the second
  send collides with the first and `UNIQUE (idempotency_key)` silently drops it
  (`data-models.md` § `outbound_emails`).
- No activity event. An email that was sent lives in `outbound_emails`, and the
  log records only what the state tables cannot answer later
  (`data-models.md` § What is _not_ logged).
- No `visibilityGeneration` bump. Nothing about access changed.
- The resent email still carries no credential. Decision 2 holds on every send.

**Errors**

| Status | Code                      | When                                                                   |
| ------ | ------------------------- | ---------------------------------------------------------------------- |
| 401    | `not_signed_in`           |                                                                        |
| 403    | `members_forbidden`       | The caller is not an admin                                             |
| 404    | `members_not_found`       | No member with that id                                                 |
| 409    | `invitations_not_pending` | The member is active or removed, or the invitation is revoked          |
| 429    | `rate_limited`            | Throttled from `invitations.last_sent_at`. `details.retryAfterSeconds` |

The `429` is the one rate limit in this slice that the middleware table in
`conventions.md` does not yet cover; see "Rulings".

**Performance** One indexed read and one single-row update. Trivial.

---

#### `DELETE /api/members/:memberId/invitation`

**Surface** 12 `members`, states `pending`, `list` ("Revoke")
**Auth** session required · **Role** admin

**Revoking an invitation closes the account, and it has to.** Decision 2 says
the invitation carries no credential: acceptance is simply the first successful
sign-in at the invited address. So the thing that grants access is the
`members` row with `status = 'invited'`, not the `invitations` row. Setting
`revoked_at` alone would leave a row that can still be mailed a sign-in code
and still sign in, which is the opposite of what the button says. The revoke
therefore runs the removal transaction as well.

**Request**

```ts
type RevokeMemberInvitationRequest = {
  /** Path. */
  memberId: string;
};
```

**Response** `200` `AdminMemberDto`, with `status: "removed"` and
`invitation.revokedAt` set. The row then falls out of the default list, which
is what the surface expects.

**One transaction**

```
BEGIN IMMEDIATE
  UPDATE invitations SET revoked_at = :now WHERE member_id = :memberId AND revoked_at IS NULL AND accepted_at IS NULL
  UPDATE members SET status = 'removed', removed_at = :now WHERE id = :memberId AND status = 'invited'
  DELETE FROM group_members WHERE member_id = :memberId
  -- bump visibility.generation
  -- insert activity_events invitation_revoked
COMMIT
```

No admin recount, and this is worth saying rather than omitting: the target is
`invited`, an invited admin was never counted as active, so revoking one cannot
move the count. The recount is skipped because it is provably a no-op, not
because it was forgotten.

One `activity_events` row, `invitation_revoked`, carrying the status change in
`detail_json`. A separate `member_removed` is not written: two rows for one
button makes the log read as two events, and `invitation_revoked` already
answers "why is this member removed".

**Errors**

| Status | Code                      | When                                                                                          |
| ------ | ------------------------- | --------------------------------------------------------------------------------------------- |
| 401    | `not_signed_in`           |                                                                                               |
| 403    | `members_forbidden`       | The caller is not an admin                                                                    |
| 404    | `members_not_found`       | No member with that id                                                                        |
| 409    | `invitations_not_pending` | Nothing live to revoke: already accepted, already revoked, or the member is active or removed |

**Performance** Three single-row writes. Trivial.

---

#### `DELETE /api/members/:memberId/sessions/:sessionId`

**Surface** 12 `members`, state `devices`
**Auth** session required · **Role** admin

A member signing out their own device is agent A's route, on My account. This
one is "an admin can sign out anybody's device", which exists because a
handed-down phone is otherwise a month of silent access.

**Request**

```ts
type RevokeMemberSessionRequest = {
  /** Path. */
  memberId: string;
  /** Path. Must belong to `memberId`. */
  sessionId: string;
};
```

**Response** `204`, no body. This is a sign-out, which `conventions.md`
§ Envelope names as one of the two cases where there is genuinely nothing to
return.

**Errors**

| Status | Code                 | When                                                                                           |
| ------ | -------------------- | ---------------------------------------------------------------------------------------------- |
| 401    | `not_signed_in`      |                                                                                                |
| 403    | `members_forbidden`  | The caller is not an admin                                                                     |
| 404    | `members_not_found`  | No member with that id                                                                         |
| 404    | `sessions_not_found` | No session with that id, **or** it belongs to a different member. Byte-identical in both cases |

The mismatched-pair `404` is the one place in this slice where the response is
deliberately identical to a nonexistent id. An admin can see every session
anyway, so nothing is being hidden from them; the rule is kept because a
handler that distinguishes the two cases is a handler somebody later copies to
a route where it matters.

**Transformations**

- Deletes the `sessions` row. The device stops working on its next request,
  because the session is looked up in the database on every request; there is
  no token to revoke and nothing to expire.
- Writes `activity_events` `device_revoked`, with `device_id` set to the
  session id and `actor_member_id` the admin. A fresh sign-in and any
  revocation are both logged, because neither is derivable from a sliding
  `last_used_at` (`data-models.md` § What is _not_ logged).
- No `visibilityGeneration` bump. Sessions are not visibility.
- An admin may revoke their own current session through this route. It behaves
  exactly like a sign-out, and the cookie is dead on the next request.

**Performance** One delete by primary key, with the `member_id` match in the
`WHERE` clause so the ownership check and the delete are one statement rather
than a read followed by a write.

---

## Groups

#### `GET /api/groups`

**Surface** 13 `groups`, states `list`, `create`, `edit`, `delete`,
`delete-used`. Also the group half of the visibility picker (surfaces 8 and 4).
**Auth** session required · **Role** uploader (two shapes)

Managing groups is admin-only, but _setting item visibility_ is an uploader
capability (`PRODUCT.md` § Roles), and an uploader cannot build a rule without the
list of groups to pick from. So this route reads at uploader and, like
`GET /api/members`, has two shapes chosen by `viewer.isAdmin`.

**The split is a security boundary, not a convenience.** `usedByOnlyRules` and
`usedByExceptRules` are counts of items, and telling an uploader that "Just us
two" covers 61 items would say how much restricted material exists beyond what
they can open. That is exactly the side channel the counting rule exists to
close (`data-models.md` § One rule that outranks the others). The member list of
a group is admin-only for the same reason it is on the Members surface.

**Request** No query parameters. Tens of rows.

**Response** `200`

```ts
/**
 * The uploader shape. Everything the visibility picker needs and nothing else.
 */
type GroupRef = {
  groupId: string;
  name: string;
};

type AdminGroupDto = {
  groupId: string;
  name: string;
  createdAt: string;
  /** Frozen DTO. The chips on the list row. */
  members: MemberRef[];
  /**
   * Items whose visibility rule names this group in an `only` rule, and in an
   * `except` rule. **Items, not rules**, despite the fixture's field name: the
   * number the confirmation leads with is "9 items say who can see them using
   * this group". The fixture's own comment says items.
   */
  usedByOnlyRules: number;
  usedByExceptRules: number;
};

type ListGroupsResponse =
  | { shape: "admin"; groups: AdminGroupDto[]; nextCursor: null }
  | { shape: "picker"; groups: GroupRef[]; nextCursor: null };
```

**Errors**

| Status | Code               | When                   |
| ------ | ------------------ | ---------------------- |
| 401    | `not_signed_in`    |                        |
| 403    | `groups_forbidden` | The caller is a viewer |

**Transformations**

- **The two usage counts are one query for every group, never N+1.** The data
  model names this explicitly (`Group.usedByRules` is "a grouped count over
  `visibility_rule_subjects`, and the Groups list must compute all of them in
  **one** query"). The count is over items, so the group-by carries the rule
  mode:

  ```sql
  SELECT s.group_id, r.mode, count(i.id) AS item_count
  FROM visibility_rule_subjects s
  JOIN visibility_rules r       ON r.id = s.rule_id
  LEFT JOIN items i             ON i.visibility_rule_id = r.id
  WHERE s.group_id IS NOT NULL
  GROUP BY s.group_id, r.mode
  ```

  The `LEFT JOIN` matters: a rule naming the group with no items left pointing
  at it still exists and still blocks the delete, and collapsing it would make
  the group look unused when the `RESTRICT` will still fire.

- **Keep the two numbers apart everywhere.** They mean opposite things:
  deleting the group takes access away from the `only` items and hands it out
  on the `except` ones. A single summed number is a confirmation that hides the
  dangerous half, which is the fixture comment's exact warning. The surface may
  add them for the "N items" cell, but the payload never does.
- `members` is `MemberRef[]`, so a group chip carries no address.

**Performance** Three queries: `groups`, the grouped usage count above, and one
`group_members` join `members` with `group_id IN (...)`. The usage count is the
only one that touches `items`, and it aggregates by `visibility_rule_id`, which
`(visibility_rule_id, captured_on)` serves as a leading-column scan. At tens of
rules it reads tens of index ranges, not the table.

---

#### `POST /api/groups`

**Surface** 13 `groups`, state `create`
**Auth** session required · **Role** admin

**Request**

```ts
type CreateGroupRequest = {
  /** Body. Stored as typed; uniqueness is on the normalised form. */
  name: string;
  /** Body, optional. Defaults to `[]`. Duplicates are deduplicated silently. */
  memberIds?: string[];
};
```

**Response** `201` `AdminGroupDto`

**Errors**

| Status | Code                | When                                                                                   |
| ------ | ------------------- | -------------------------------------------------------------------------------------- |
| 400    | `invalid_request`   | Empty name, or a `memberIds` entry that is unknown or `removed`. `details.fieldErrors` |
| 401    | `not_signed_in`     |                                                                                        |
| 403    | `groups_forbidden`  | The caller is not an admin                                                             |
| 409    | `groups_name_taken` | Another group normalises to the same name                                              |

**Transformations**

- Uniqueness is on the normalised name (trimmed, lowercased,
  whitespace-collapsed, NFC), matching `tags.name_normalized`. Nothing demands
  it, but two groups called "Cousins" makes the visibility picker unusable and
  there is no way to tell them apart in a chip
  (`data-models.md` § `groups` and `group_members`).
- An `invited` member may be added; a `removed` member may not. The create
  form's copy is "Only people who can sign in", and a pending invitee will be
  able to. A removed member never will, and a group is a way of naming several
  people who can.
- Writes `activity_events` `group_created`, with `detail_json.memberIds`.
- **Bumps `visibilityGeneration` only when `memberIds` is non-empty.** An empty
  new group grants nothing to anybody and no cached rule set moves. Creating
  one with members does change who is in a group, which is one of the three
  bump triggers.

**Performance** One insert plus a bulk insert into `group_members`. Nine rows.

---

#### `PATCH /api/groups/:groupId`

**Surface** 13 `groups`, state `edit` ("What to call it")
**Auth** session required · **Role** admin

**Request**

```ts
type RenameGroupRequest = {
  /** Path. */
  groupId: string;
  /** Body. */
  name: string;
};
```

**Response** `200` `AdminGroupDto`

**Errors**

| Status | Code                | When                                      |
| ------ | ------------------- | ----------------------------------------- |
| 400    | `invalid_request`   | Empty name                                |
| 401    | `not_signed_in`     |                                           |
| 403    | `groups_forbidden`  | The caller is not an admin                |
| 404    | `groups_not_found`  | No group with that id                     |
| 409    | `groups_name_taken` | Another group normalises to the same name |

**Transformations**

- Writes `activity_events` `group_renamed`, with the previous and new name.
- **No `visibilityGeneration` bump.** A rename changes no access at all, and
  the new name appears everywhere immediately without one, because the
  restricted marker on a print ("Just us two") is composed from the rule's
  subjects at read time and is never stored
  (`data-models.md` § Visibility tables). A stored label would go stale here;
  that is the reason it is not stored.

**Performance** One update by primary key.

---

#### `PUT /api/groups/:groupId/members`

**Surface** 13 `groups`, state `edit` ("Who is in it")
**Auth** session required · **Role** admin

`PUT` because the body is the whole membership set, so a repeated request is a
no-op rather than a duplicate. The `UNIQUE (group_id, member_id)` constraint
makes any other shape a conflict-handling exercise for no gain.

**Request**

```ts
type ReplaceGroupMembersRequest = {
  /** Path. */
  groupId: string;
  /**
   * Body. The complete set. Order is ignored and duplicates are deduplicated.
   */
  memberIds: string[];
};
```

**Response** `200`

```ts
type ReplaceGroupMembersResponse = {
  members: MemberRef[];
  nextCursor: null;
};
```

The addressed resource is the membership set, so the response is that set in
its read shape, in the collection envelope.

**This is the most consequential invisible write in the product.** Groups are
expanded at read time, so adding somebody to _Cousins_ retroactively grants
them everything ever restricted to _Cousins_, and nobody revisits those
photographs. It cuts the other way too, and the second direction is the one
nobody expects: taking somebody out of a group named in an **`except`** rule
_grants_ them the items that rule was hiding from them. The edit dialog states
the first consequence; both are real and both happen the instant this returns.

**One transaction**

```
BEGIN IMMEDIATE
  -- diff the requested set against group_members
  DELETE FROM group_members WHERE group_id = :groupId AND member_id IN (:removed)
  INSERT INTO group_members (group_id, member_id) VALUES ...   -- :added
  -- bump visibility.generation
  -- insert activity_events group_membership_changed
COMMIT
```

**Errors**

| Status | Code               | When                                                                                  |
| ------ | ------------------ | ------------------------------------------------------------------------------------- |
| 400    | `invalid_request`  | An entry is unknown or belongs to a `removed` member. `details.fieldErrors.memberIds` |
| 401    | `not_signed_in`    |                                                                                       |
| 403    | `groups_forbidden` | The caller is not an admin                                                            |
| 404    | `groups_not_found` | No group with that id                                                                 |

**Transformations**

- Writes one `activity_events` `group_membership_changed`, with `detail_json`
  carrying `added` and `removed` as ids plus their labels at the time. This
  kind earns its place more than it looks: `group_members` holds the current
  state only, and nothing else in the database records that somebody was
  granted a year of photographs retroactively
  (`data-models.md` § `activity_events`).
- **Bumps `visibilityGeneration`**, always, even when the diff is empty, so
  that a client which resubmits after a concurrent edit cannot end up with a
  cached rule set older than the row it just wrote. The bump is one integer
  write and invalidates every viewer's cache at once, which is the point.
- **Emptying a group has the same both-ways consequence as deleting one.** A
  group with no members that is the sole subject of an `only` rule is an empty
  allow list, and those items fail closed to admins only. This route does not
  block it and does not require a confirmation; the surface should call
  `GET /api/groups/:groupId/usage` first when the requested set is empty and
  show the same warning the delete confirmation shows. Left non-blocking
  deliberately: emptying a group is reversible in one request, and deleting one
  is not.

**Performance** One delete and one insert over `group_members`, both served by
`UNIQUE (group_id, member_id)`, plus the `(member_id, group_id)` index that
exists for the read-time expansion. Nine rows. Compute the diff in the
application from the current set, which is already in hand from the list.

---

#### `GET /api/groups/:groupId/usage`

**Surface** 13 `groups`, states `delete`, `delete-used`
**Auth** session required · **Role** admin

**What a delete would do, before it does it.**
`visibility_rule_subjects.group_id` is `ON DELETE RESTRICT`, so the database
refuses to let a group go while a rule names it. Cascading looks harmless and
is not: taking a group out of an `only` rule narrows access, which is safe, but
taking it out of an **`except`** rule _widens_ it, and every photograph that
rule was hiding is silently revealed, in a trigger nobody is reading, at the
moment an admin pressed a button labelled "delete a group"
(`data-models.md` § Deleting a group is a security boundary). This route is how
the admin is told, in both directions, before anything happens.

**Request**

```ts
type GetGroupUsageRequest = {
  /** Path. */
  groupId: string;
};
```

**Response** `200`

```ts
type GroupUsageRuleDto = {
  ruleId: string;
  /**
   * The rule as it stands. Frozen DTO. `mode` is never `"everyone"` here: an
   * `everyone` rule has no subjects, so it cannot name a group.
   */
  visibility: VisibilitySummary;
  /**
   * What taking this group out of this rule does to who may see its items.
   * `"narrows"` for an `only` rule, `"widens"` for an `except` rule.
   */
  effect: "narrows" | "widens";
  /** Items pointing at this rule. Admin-scoped, so unfiltered. */
  itemCount: number;
  /**
   * The rule after the rewrite, with this group taken out and the label
   * recomposed. Frozen DTO, so `subjects: []` is exactly how an empty allow
   * list looks on the wire.
   */
  visibilityAfter: VisibilitySummary;
  /**
   * True when this is an `only` rule whose last subject is this group. Its
   * items then fail closed to admins only, which is the safe direction but
   * has to be said out loud rather than discovered later.
   */
  becomesEmptyAllowList: boolean;
};

type GroupUsageResponse = {
  group: GroupRef;
  /** Items that lose an audience. Summed over the `only` rules below. */
  narrowingItemCount: number;
  /**
   * Items that gain one. Summed over the `except` rules below. The dangerous
   * half.
   */
  wideningItemCount: number;
  /** Items whose rule becomes an empty allow list, visible to admins alone. */
  emptyAllowListItemCount: number;
  /** Deduplicated across rules. Who can no longer open something they could. */
  membersLosingAccess: MemberRef[];
  /** Deduplicated across rules. Who can now open something they could not. */
  membersGainingAccess: MemberRef[];
  rules: GroupUsageRuleDto[];
  /**
   * Opaque, signed with the server secret, valid ten minutes, and required by
   * `DELETE /api/groups/:groupId` whenever `rules` is non-empty. It binds the
   * confirmation to the usage the admin actually read. Null when `rules` is
   * empty, because there is then nothing to confirm.
   */
  confirmationToken: string | null;
};
```

`rules` is a field of one resource rather than a top-level collection, so it
carries no envelope and no cursor. Tens of rules at most.

**Errors**

| Status | Code               | When                       |
| ------ | ------------------ | -------------------------- |
| 401    | `not_signed_in`    |                            |
| 403    | `groups_forbidden` | The caller is not an admin |
| 404    | `groups_not_found` | No group with that id      |

**Transformations**

- `effect` is a pure function of `visibility.mode`: `only` narrows, `except`
  widens. It is a field rather than a client-side derivation because the
  confirmation copy turns on it and the two words must not drift apart between
  the surface and the log.
- `membersGainingAccess` for an `except` rule is the group's members, minus
  anybody the rule still denies by name or through another group it names. The
  mockup's "The people in the group keep whatever they were granted by name" is
  this subtraction. `membersLosingAccess` for an `only` rule is the mirror.
  Both are computed by expanding the rule's remaining subjects over
  `group_members`, which is nine rows.
- `becomesEmptyAllowList` and `emptyAllowListItemCount` are the consequence the
  data model calls out explicitly. Those items stay visible to admins and to
  their own uploader (Decision 7), and to nobody else.
- `confirmationToken` is `HMAC(server_secret, groupId + canonical digest of the rule ids, modes and item counts)` plus an
  issue time. Nothing is stored: it is a signature over what was shown, not a
  reservation. If the rules move between reading and deleting, the signature no
  longer matches the recomputed digest and `DELETE` refuses, which is the point.
- Nothing is written. This route has no side effects at all.

**Performance** One query for the rules naming the group, one grouped count of
items per rule, one expansion of the remaining subjects over `group_members`.
The item count is the same aggregate the list route computes and uses the same
`(visibility_rule_id, captured_on)` index. Do not call this per rule.

---

#### `DELETE /api/groups/:groupId`

**Surface** 13 `groups`, states `delete`, `delete-used`
**Auth** session required · **Role** admin

The deliberate rewrite that the `RESTRICT` exists to force. The database
refuses to do it implicitly; this route does it explicitly, in one transaction,
having told the admin what happens in both directions.

**Request**

```ts
type DeleteGroupRequest = {
  /** Path. */
  groupId: string;
  /**
   * Query. The token from `GET /api/groups/:groupId/usage`. Required when any
   * rule names this group; omit it when the usage response carried none.
   */
  confirmationToken?: string;
};
```

**Response** `204`, no body. The resource is gone, and the effect was already
stated in the usage payload the token is a signature over. Returning a fresh
summary would invite a client to show a different number afterwards than the
one the admin approved.

**One transaction**

```
BEGIN IMMEDIATE
  -- recompute the usage digest; compare with confirmationToken
  --   no token and rules exist   -> ROLLBACK, 409 groups_confirmation_required + usage in details
  --   token does not match       -> ROLLBACK, 409 groups_usage_changed + fresh usage in details
  FOR EACH rule naming the group:
    DELETE FROM visibility_rule_subjects WHERE rule_id = :ruleId AND group_id = :groupId
    UPDATE visibility_rules SET subject_digest = :recomputed WHERE id = :ruleId
  DELETE FROM groups WHERE id = :groupId        -- group_members CASCADEs
  -- bump visibility.generation
  -- insert activity_events group_deleted
COMMIT
```

**Errors**

| Status | Code                           | When                                                                                                                                 |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 401    | `not_signed_in`                |                                                                                                                                      |
| 403    | `groups_forbidden`             | The caller is not an admin                                                                                                           |
| 404    | `groups_not_found`             | No group with that id                                                                                                                |
| 409    | `groups_confirmation_required` | Rules name this group and no token was sent. `details` is the full `GroupUsageResponse`                                              |
| 409    | `groups_usage_changed`         | The token no longer matches: a rule was added, removed or repointed since it was issued. `details` is the fresh `GroupUsageResponse` |
| 409    | `groups_delete_restricted`     | The `RESTRICT` fired anyway. Unreachable under `BEGIN IMMEDIATE`; mapped rather than surfaced as a 500                               |

`409` rather than `403` for the unconfirmed case, and the distinction matters:
the admin is allowed to do this, the state is not yet ready for it.

**Transformations**

- `subject_digest` is recomputed from the remaining subjects, canonically
  sorted. **Do not merge a rule whose new digest collides with an existing
  rule's.** The index on `(mode, subject_digest)` is deliberately not unique,
  and tolerating an equivalent duplicate is cheaper than merging them
  mid-transaction (`data-models.md` § What that costs). A sweeper drops
  unreferenced rules later.
- An `only` rule left with no subjects keeps `mode = 'only'` with an empty
  subject list. It is not rewritten to `everyone`, which would be the widening
  the whole route exists to prevent, and it is not deleted, because items point
  at it with `RESTRICT`. It fails closed: admins, and the item's own uploader.
- Writes one `activity_events` `group_deleted`, with `detail_json` carrying the
  rewritten rule ids, the item counts in each direction and the members who
  gained access. **This is the only record that a widening happened.** Nobody
  is told, no photograph is deleted, and the rules now read as if the group
  never existed, so if the log does not carry it nothing does.
- **Bumps `visibilityGeneration`**, which is what makes the widening take
  effect on the next request rather than whenever a cache happened to expire.
- `group_members` goes by `ON DELETE CASCADE`, which is correct here: a group
  membership means nothing without its group, and it is the subject rows, not
  the memberships, that the `RESTRICT` protects.
- A group nothing points at deletes with no token and no rewrite, which is the
  `delete` state: "Nothing points at this group, so deleting it changes what
  nobody can see."

**Performance** Tens of rule rows at most. The recount inside the transaction
repeats the usage query, which is the one that touches `items`; it runs once,
not per rule.

---

## Shoebox settings

#### `GET /api/settings`

**Surface** 11 `settings`, states `default`, `renaming`, `tidy`, `timezone`,
`mail-failing`
**Auth** session required · **Role** admin

**A fresh instance holds zero `settings` rows and this route must still render
the surface correctly.** That is the whole reason `SETTING_DEFINITIONS` lives
in `packages/shared`: both halves of the app read the same object, the default
`"My Shoebox"` sits beside its key rather than buried in DDL, and the server
resolves every key before it answers.

**Request** No parameters.

**Response** `200`

```ts
/** The six editable keys, distinct from registry-wide internal keys. */
type EditableInstanceSettingKey =
  | "shoebox.name"
  | "shoebox.timezone"
  | "pile.arrangement"
  | "mail.from_address"
  | "mail.from_name"
  | "public.base_url";

type StorageUsageDto = {
  /** `count(*)` over `items`. Admin-scoped, so unfiltered. */
  itemCount: number;
  /**
   * `sum(byte_size)` over `items`, coerced from null to 0 on an empty archive.
   */
  byteSize: number;
};

type ResolvedSettings = {
  shoebox: {
    name: string;
    /** IANA zone. */
    timezone: string;
  };
  pile: {
    arrangement: "tidy" | "messy";
  };
  mail: {
    fromAddress: string | null;
    fromName: string | null;
  };
  public: {
    baseUrl: string | null;
  };
};

type GetSettingsResponse = ResolvedSettings & {
  /**
   * Every key with no `settings` row, resolved from the registry default. A
   * fresh instance lists all six. The timezone seeding request keys off this.
   */
  defaultedKeys: EditableInstanceSettingKey[];
  /** Provenance, one entry per key that has a row. */
  changedBy: {
    key: EditableInstanceSettingKey;
    updatedAt: string;
    /**
     * Null when the member row is gone, which `updated_by_member_id` SET NULL
     * allows.
     */
    updatedBy: MemberRef | null;
  }[];
  storage: StorageUsageDto;
};
```

**Registry key to JSON path**

| Registry key        | JSON path          | Default      | Scopes     |
| ------------------- | ------------------ | ------------ | ---------- |
| `shoebox.name`      | `shoebox.name`     | `My Shoebox` | `instance` |
| `shoebox.timezone`  | `shoebox.timezone` | `UTC`        | `instance` |
| `pile.arrangement`  | `pile.arrangement` | `messy`      | `instance` |
| `mail.from_address` | `mail.fromAddress` | `null`       | `instance` |
| `mail.from_name`    | `mail.fromName`    | `null`       | `instance` |
| `public.base_url`   | `public.baseUrl`   | `null`       | `instance` |

**Three keys this route deliberately does not serve.**
`mail.domain_verified_at` and `mail.domain_last_check_error` belong to agent
H's `GET /api/mail/health`, which the `mail-failing` state renders from,
together with its query over `outbound_emails`. `visibility.generation` is
internal plumbing and appears in no payload. The surface makes two requests,
and the second one is not this slice's.

**Errors**

| Status | Code                 | When                       |
| ------ | -------------------- | -------------------------- |
| 401    | `not_signed_in`      |                            |
| 403    | `settings_forbidden` | The caller is not an admin |

**Transformations**

- Every value is resolved: the stored row if there is one, the registry default
  otherwise. The client never applies a default and never needs to know one.
- `public.base_url` is easy to forget and every email is broken without it,
  because an absolute link is the only kind an email can carry. It appearing in
  `defaultedKeys` is the signal that mail will send broken links.
- **The storage figures are computed, not cached.**
  `SELECT count(*), sum(byte_size) FROM items` over a few thousand rows is
  sub-millisecond, and a cache here is a correctness risk bought with nothing
  (`data-models.md` § `settings`).
- **The figure is indexed media, not bucket truth.** Thumbnails and renditions
  live in the same bucket under their own prefix, and orphans will drift. The
  surface's copy ("2,147 files, 61.4 GB, in a bucket you own") is about what
  Memory Shoebox indexes, and the payload carries no claim about the bucket.
- `storage.itemCount` is unfiltered because an admin's visibility is absolute.
  If this figure is ever served to a lower role it becomes a per-viewer count,
  at which point it stops being the storage figure and should not be served at
  all.

**Performance** One scan of `settings` (six rows at most), one aggregate over
`items`. The aggregate is the only statement here that grows with the archive
and it is a single pass over one index.

---

#### `PATCH /api/settings`

**Surface** 11 `settings`, states `renaming`, `tidy`, `timezone`
**Auth** session required · **Role** admin

**Request**

```ts
type UpdateSettingsRequest = {
  /**
   * Query. When true, everything is validated and every consequence is
   * computed, and nothing is written. One code path serves the banner and the
   * save, so the number the admin approves is the number that gets applied.
   */
  preview?: boolean;
  /** Body. A strict partial of `ResolvedSettings`; preview is query-only. */
  shoebox?: { name?: string; timezone?: string };
  pile?: { arrangement?: "tidy" | "messy" };
  mail?: { fromAddress?: string | null; fromName?: string | null };
  public?: { baseUrl?: string };
};
```

**Response** `200`

```ts
type UpdateSettingsResponse = GetSettingsResponse & {
  /** Echoes the query parameter. True means nothing was written. */
  isPreview: boolean;
  /**
   * Non-null only when `shoebox.timezone` is in the request and differs from
   * the resolved value.
   */
  timezoneImpact: TimezoneImpactDto | null;
};

type TimezoneImpactDto = {
  fromZone: string;
  toZone: string;
  /**
   * Items with `captured_at_offset_minutes IS NULL` whose `captured_on`
   * resolves to a different day in the new zone. The banner's "34 items with
   * no offset of their own would shift".
   */
  movingItemCount: number;
  /**
   * Items that would be ejected from a burst, because a burst is a same-day
   * run.
   */
  burstEjectionItemCount: number;
  /**
   * Per milestone, the attached items that would then fall outside its span.
   */
  milestoneMismatches: {
    milestone: MilestoneRef;
    itemCount: number;
  }[];
};
```

**Validation is `SETTING_DEFINITIONS` and nothing else.** Each key is parsed
with its own schema from the registry, and the scope restriction is checked
before the write: this route writes `scope = 'instance'`, so a key whose
`scopes` does not include `"instance"` is rejected. That check is load-bearing
in the other direction too, and it is where it pays: `pile.arrangement` has
`scopes: ["instance"]`, so the member-scoped writer on My account (agent A) is
refused by the same registry rather than by a second list somebody has to
remember to update. "One wall for everybody" is enforced by the type registry,
not by the absence of a control.

**Errors**

| Status | Code                       | When                                                                                                                                                                                 |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400    | `invalid_request`          | A value fails its registry schema, an unknown key, `shoebox.timezone` is not a resolvable IANA zone. `details.fieldErrors`                                                           |
| 400    | `settings_not_writable`    | `mail.domain_verified_at`, `mail.domain_last_check_error` or `visibility.generation` was sent. They are written by the mail checker and by the visibility writers, never by an admin |
| 400    | `settings_scope_forbidden` | The key does not permit the `instance` scope                                                                                                                                         |
| 401    | `not_signed_in`            |                                                                                                                                                                                      |
| 403    | `settings_forbidden`       | The caller is not an admin                                                                                                                                                           |

**Transformations**

- One transaction for every key in the request, so a rename and an arrangement
  change either both land or neither does.
- The upsert targets the partial unique index, because SQLite treats nulls as
  distinct in a `UNIQUE` and a plain `UNIQUE (scope, scope_id, key)` would
  allow two instance rows for the same key
  (`data-models.md` § `settings`):
  `INSERT INTO settings (scope, scope_id, key, value, updated_at, updated_by_member_id) VALUES ('instance', NULL, ...) ON CONFLICT (key) WHERE scope = 'instance' DO UPDATE SET ...`
- Writes one `activity_events` `setting_changed` per key actually changed, with
  the previous and new value in `detail_json`. `settings` holds the current
  value only, so the log is the only record of what it used to be.
- No `visibilityGeneration` bump. No setting in this route changes who may see
  what.

**Changing `shoebox.timezone` moves photographs between days.** `captured_on`
is stored, not computed, because `date(captured_at)` in UTC puts a 23:30 local
photograph on the wrong day and therefore under the wrong milestone. So the
zone change has to rewrite it, and on commit the same transaction:

1. Selects items with `captured_at_offset_minutes IS NULL`, which is exactly
   "a scan, a file whose camera never knew where it was, a video from an app
   that stripped the metadata". Items carrying an offset are unaffected.
2. Recomputes `captured_on` in the new zone and updates the ones that move,
   changing only the stored local day. `captured_at`, `original_captured_at` and `capture_source` are
   never written: the instant is unchanged and how it was arrived at is
   unchanged, only the local day it resolves to.
3. **Ejects a moved item from its burst** (`burst_id = NULL`) when it leaves its
   burst's day, because a burst is a same-day run by definition, and drops the
   burst row if that empties it (`data-models.md` § `item_capture_date_changes`).
4. Clears `item_milestones.span_mismatch_acknowledged_at` for any item that now
   falls outside an attached milestone's span, which **raises the existing
   mismatch flow rather than a new one**. The reconciliation itself is agent
   D's; this route only reports the count and re-opens the flag.

The same computation runs under `preview=true` and writes nothing, which is
what the `timezone` state's banner renders.

**The seeding request.** `shoebox.timezone` is seeded from the admin's own
browser zone the first time they open Shoebox settings, and the seeding is an
ordinary `PATCH`, not a special route:

1. `GET /api/settings`. If `defaultedKeys` does not include
   `"shoebox.timezone"`, somebody has already set it; do nothing.
2. `PATCH /api/settings?preview=true` with
   `{ shoebox: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } }`.
3. If `timezoneImpact.movingItemCount` is `0`, which is the fresh-instance case
   and the common one, commit immediately with the same body and no
   `preview`. The admin never sees a dialog about a change that moves nothing.
4. Otherwise show the `timezone` banner with the real figures and let the admin
   decide. An existing archive built under the default zone is exactly the case
   where silently reshuffling days would be indefensible.

`shoebox.timezone` is also what settles the two other places with no timezone
at all: the activity log's day boundary and the weekly removal reminder's
clock. Both are other agents' routes and both read this key.

**Performance** The settings writes are single rows. The timezone impact is the
one admin action in this slice that touches every item: a single pass over
`items` filtered on `captured_at_offset_minutes IS NULL`, with the zone
arithmetic done in the application because SQLite has no IANA zone database.
There is no index on that column and one is not proposed for a preview an admin
runs once; at 50,000 rows it is a single scan, tens of milliseconds, on a
user-initiated action. **Do not run the impact computation on the plain
settings read**; it belongs only to a request that names `shoebox.timezone`.
Preview uses catalog joins rather than an unbounded item-ID parameter list;
save applies bounded write batches under the same immediate transaction, so
large shifts preserve atomicity without exceeding SQLite's parameter limit.

---

## Shared types in this slice

DTOs used by more than one route here, none of which widens a frozen DTO.

```ts
type MemberRole = "viewer" | "uploader" | "admin";
type MemberStatus = "invited" | "active" | "removed";

/**
 * An invitation, which carries no credential: no token, no `consumed_at` and
 * no attempt cap, because there is nothing to consume or to guess. The email
 * names the address and links to a join page; the join link carries the
 * address as a plain query parameter, which is an address, not a credential.
 * Decision 2.
 */
type MemberInvitationDto = {
  invitationId: string;
  invitedBy: MemberRef;
  createdAt: string;
  /** Seven days from the last send. Stated in the email and the banner. */
  expiresAt: string;
  /** Part of the email idempotency key, which is why it is on the wire. */
  sendCount: number;
  lastSentAt: string;
  revokedAt: string | null;
  /** Mirrors `members.joined_at`. */
  acceptedAt: string | null;
  /**
   * Computed against the server clock: not revoked, not accepted, not expired.
   * The client must not re-derive it from `expiresAt`.
   */
  isPending: boolean;
};

type AdminMemberDto = {
  /* see GET /api/members */
};
type GroupRef = {
  groupId: string;
  name: string;
};
type AdminGroupDto = {
  /* see GET /api/groups */
};
type GroupUsageRuleDto = {
  /* see GET /api/groups/:groupId/usage */
};
type StorageUsageDto = {
  /* see GET /api/settings */
};
type ResolvedSettings = {
  /* see GET /api/settings */
};
type TimezoneImpactDto = {
  /* see PATCH /api/settings */
};
```

Frozen DTOs used unchanged: `MemberRef` (every member reference, every group
chip), `PersonRef` (the invite pre-fill), `VisibilitySummary` (a rule before
and after a group is taken out of it), `MilestoneRef` (the timezone mismatch
list). `SessionDto` is agent A's and is used unchanged by
`GET /api/members` and `DELETE /api/members/:memberId/sessions/:sessionId`.

**Error codes this slice appends to the registry**

| Code                           | Status |
| ------------------------------ | ------ |
| `members_forbidden`            | 403    |
| `members_not_found`            | 404    |
| `members_last_admin`           | 409    |
| `members_not_active`           | 409    |
| `members_already_removed`      | 409    |
| `members_already_active`       | 409    |
| `members_invitation_pending`   | 409    |
| `invitations_not_pending`      | 409    |
| `sessions_not_found`           | 404    |
| `groups_forbidden`             | 403    |
| `groups_not_found`             | 404    |
| `groups_name_taken`            | 409    |
| `groups_confirmation_required` | 409    |
| `groups_usage_changed`         | 409    |
| `groups_delete_restricted`     | 409    |
| `settings_forbidden`           | 403    |
| `settings_not_writable`        | 400    |
| `settings_scope_forbidden`     | 400    |

`sessions_not_found` will collide with agent A's slice, which owns the member's
own device routes. It is the same condition and should merge to one code.

## Additions requested to the frozen DTOs

None. `MemberRef`, `PersonRef`, `VisibilitySummary` and `MilestoneRef` carried
everything this slice needed, and the two administrative shapes it does need
(`AdminMemberDto`, `AdminGroupDto`) are new DTOs rather than widenings, because
their extra fields are precisely the ones that must never reach a lower role.

One observation rather than a request: `VisibilitySummary` turned out to be
exactly the right shape for `visibilityAfter` on the group usage response,
including `subjects: []` for an empty allow list and a `label` recomposed from
what remains. Nothing needs adding for that to work.

## Rulings

1. **`GET /api/member-suggestions` stays, and this document's own route body
   is the argument.** The question offered to collapse it into
   `GET /api/people` as a `?nameLike=` filter. Its Transformations note rules
   that out: `itemCount` here is the **unfiltered** total, correct only because
   an admin's visibility is absolute, and it says in as many words that the
   route "must never be opened to a lower role, at which point the count would
   have to be filtered and the suggestion would leak how many restricted
   photographs name somebody".

   `GET /api/people` is the member-facing directory, where a person's
   `itemCount` is per viewer. Folding these together would put two count
   semantics behind one path, switched on the caller's role, which is precisely
   the shape that leaks when somebody later adds a parameter. Two routes with
   one matching rule, written here and cited from there, is the cheaper
   mistake.

   It is added to the expected route set rather than justified as an exception
   to it.

2. **The resend throttle is middleware, with a row of its own.**
   `conventions.md` § Rate limits now carries
   `POST /api/members/:memberId/invitation/resend`, 1 per minute and 10 per day
   **per invitation**, read from `invitations.last_sent_at`, which exists for
   exactly this. The middleware learns to read it rather than this one handler
   being granted an exception, because an exception is how a rate limit ends up
   applied in two places and enforced in one.

3. **The expired invitation: closed on merge.** The `invitation-lapse` job in
   `conventions.md` § The job runner flips any `invited` member whose latest
   invitation is past `expires_at` and unrevoked to `status = 'removed'`. That
   is one of the two options this question asked for, and the sign-in route
   does **not** also check for a live invitation: `members.status` alone
   decides whether an address may sign in, which is what Decision 2 bought.

4. **A timezone rewrite writes one `item_capture_date_changes` row per moved
   item, and this slice was wrong.** The third `reason` value already exists:
   `data-models.md` § `item_capture_date_changes` declares
   `(milestone_reconcile | manual | timezone_change)` and says why the bulk
   case still writes per item. "This table is what makes 'revert that' mean
   something, and a single row saying 34 items moved cannot be reverted per
   item. Thirty-four rows, written once, read on no hot path, is exactly what
   the table was sized for."

   That argument beats the one this document made. Write
   `reason = 'timezone_change'`, one row per item, in the same transaction as
   the setting change. The `setting_changed` activity row is still written,
   because the setting did change, but it is not the record of what moved.
   Each history row contains both local dates and the unchanged instant on
   both sides, plus the previous capture source. `items.captured_at`, stored
   offsets, `items.original_captured_at`, `items.capture_source` and upload-file
   evidence are untouched. The existing `POST /api/items/:itemId/capture-date`
   endpoint accepts the history row's previous local date to revert that item's
   day through the ordinary manual-correction flow.

5. **The Shoebox name for a non-admin: two answers, because it is two
   questions.** Anonymously, `GET /api/public-settings` returns an allow-listed
   subset of `SETTING_DEFINITIONS`, today `shoebox.name` and `public.base_url`.
   It is a new route in this slice, sitting beside `GET /api/settings`, which
   stays admin-only because it also carries the mail configuration and the
   storage figures. For a signed-in member, `shoebox.name`,
   `pile.arrangement` and `shoebox.timezone` ride on `CreateSessionResponse`,
   because they are bootstrap, not a second fetch. The auth slice asked the
   same question and gets the same answer.

6. **`groups.name_normalized`, confirmed and now named in the schema.** Same
   normalisation as `tags`: trimmed, lowercased, whitespace-collapsed, NFC.
   `data-models.md` said "`UNIQUE (name)` on the normalised form" without
   naming the column, which is how two slices end up with two names for it.

7. **The confirmation token stays; it does not become a boolean.** The
   argument in the question is the ruling: the dangerous half of deleting a
   group is a silent widening, and a rule added between the admin reading the
   usage and pressing the button would otherwise be approved unseen. An HMAC
   over the digest of what was shown, valid ten minutes, costs no table and no
   migration. `groups_usage_changed` stays with it.

8. **`GET /api/groups` reads at uploader, with two shapes: confirmed.**
   Uploaders set item visibility, so they need the names. They must not get the
   member lists or the usage counts, because those counts are item counts and
   would say how much restricted material exists, which is the counting rule's
   whole concern. The picker sources its groups here, not elsewhere.

## Appendix: first-run setup contracts

The approved [administration design](../../../../superpowers/specs/2026-10-04-administration-design.md)
adds the narrow anonymous creation exception below. Setup is required only
when the catalog contains zero member rows, including invited and removed
members. Existing settings rows do not initialize it.

| Method and path            | Access                           | Response                                                                               |
| -------------------------- | -------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /api/setup`           | Anonymous                        | `SetupStatusResponse`: `{ isRequired: boolean }`                                       |
| `POST /api/setup`          | Anonymous while no member exists | `201 CreateSetupResponse`, the existing `CreateSessionResponse`, with a session cookie |
| `GET /api/setup/progress`  | Active admin                     | `SetupProgressResponse`: `{ needsInvitations: boolean }`                               |
| `POST /api/setup/complete` | Active admin                     | Idempotent `204`, no body                                                              |

`CreateSetupRequest` contains required `admin: { displayName, email }`,
`shoebox: { name, timezone }`, and `public: { baseUrl }`, plus optional
`mail: { fromAddress, fromName }`. Names are trimmed, the administrator's
name uses the existing member-name cap, and email uses the shared
normalization. Instance values use `SETTING_DEFINITIONS`; the base URL is
required and non-null. Mail values may be null to leave mail unconfigured.
Every input object is strict: roles, status, internal settings and unknown
nested fields are rejected with `400 invalid_request`.

Creation rechecks the empty member catalog under `BEGIN IMMEDIATE` and writes
one active admin, settings, the standard session, audit events and
`setup.pending_member_id` together. The cookie is set after commit. No
invitation or credential is returned. Concurrent or repeated creation returns
`409 setup_already_completed` without account details. Protected setup routes
use `401 not_signed_in` and `403 setup_forbidden`. Creation requires JSON,
rejects a supplied Origin different from the serving origin, and is limited
to 20 attempts per hour per IP in memory. Status and progress reads are uncached.

`setup.pending_member_id` is private, instance-only, nullable and not among
`EDITABLE_INSTANCE_SETTING_KEYS` or `PUBLIC_SETTING_KEYS`. Clearing it makes
completion idempotent. The creation response reuses the session bootstrap so
the web app receives the same member, device and shell settings after setup
as after ordinary sign-in.
