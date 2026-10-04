# Notifications and observation

What the Shoebox sends out, and what it is able to say about who has been
looking. Two halves of one slice because both read the tables that record
activity rather than content: `outbound_emails` on the way out,
`item_views`, `activity_events`, `comments` and the two reaction tables on
the way back in.

**Not here.** No route that _causes_ an email: the sign-in code request, the
invite and its resend, the upload commit, the comment write, the removal
request, the decline and the item delete all belong to other slices, and this
document fixes only the payload they enqueue and the recipient rule they
enqueue it for. No Shoebox settings CRUD, including the `mail.*` keys, which
this slice reads and never writes. No `item_views` writes: neither the
timeline's seen latch nor the item viewer's open counter is here, only their
readers. No comment or reaction reads; a reaction is in this document exactly
once, to say that it sends nothing.

## Routes

| Method | Path                         | Auth    | Role          | Purpose                                                                    |
| ------ | ---------------------------- | ------- | ------------- | -------------------------------------------------------------------------- |
| GET    | `/api/presence`              | session | self-or-admin | A row per member: last signed in, days active, opened, comments, reactions |
| GET    | `/api/items/:itemId/viewers` | session | admin         | Who opened this one, who only scrolled past, who has not seen it           |
| GET    | `/api/activity`              | session | admin         | What has been changed: who may see what, who may do what, what was deleted |
| GET    | `/api/mail/health`           | session | admin         | Whether mail is going out, with a cause an admin can act on                |

Part 1 below is not HTTP and has no row in that table.

---

# Part 1: the outbound email contract

**None of this is a route.** It is a typed payload in `packages/shared` plus
one sender service that every other slice calls, and it is in the API contract
for two reasons: the payload crosses the same boundary a response does (the
web app never sees it, but four slices construct it), and the recipient rule
is a visibility evaluation that must match the one the routes use exactly, or
an email becomes the side channel the counting rule exists to close.

Nine messages, seven `kind` values. `removal_resolved` renders as three
different messages discriminated by `payload.outcome`, which is why
`data-models.md` § `outbound_emails` gives it one idempotency recipe and
surface 16 gives it three states.

## Rules that hold for all nine

**The payload holds resolved values, never ids** (`data-models.md` §
`outbound_emails`). The test is mechanical: the renderer takes the payload and
nothing else. If rendering would need a query, the payload is wrong. A retry a
day later therefore produces the identical message even if the comment has
been edited, the item deleted, the member renamed or the group dissolved.

**Every instance setting the renderer reads is resolved at enqueue too**, and
travels in `EmailCommon`. Without that, changing `shoebox.timezone` between
enqueue and send would move a batch's day in a queued message, which is the
same non-determinism the recipient snapshot exists to avoid.

**`public.base_url` is required by every one of the nine**, because an
absolute link is the only kind an email can carry (`data-models.md` §
`settings`). Its failure mode is documented below and it is the first
diagnostic `GET /api/mail/health` reports.

**No email carries a credential.** Every link is a plain URL that requires a
session at the far end. The invitation link carries the invited address as a
query parameter, which is an address, not a credential (Decision 2), and there
are no bearer URLs anywhere in the product (`PRODUCT.md` § Out of scope).

**One row per recipient, always.** Surface 16's removal envelopes read
`To: andres@example.com, and 2 admins`; that is the mockup drawing a fan-out in
one frame. The contract sends one `outbound_emails` row with one address per
recipient, because the idempotency recipes are keyed
`<thing>:<id>:<member_id>`, because Decision 4 requires the body to differ per
recipient, and because a shared `To` header would show the family each other's
addresses.

**The actor never receives their own notification.** The uploader is not told
about their own upload, the commenter not about their own comment, the
requester not about their own request. Clause 2 of the evaluation guarantees an
uploader can see every item in their own batch, so exclusion costs them
nothing.

**Recipients are `members.status = 'active'` only.** A removed member is never
mailed. An invited member who has not yet signed in is not mailed either: their
invitation is already doing that job, and a second stream of mail to somebody
who has not arrived is exactly what surface 17's quiet end says to stop doing.
The two exceptions are `sign_in_code` and `invitation`, which are addressed to
a person rather than selected from the membership.

**A reaction never sends anything**, on an item or on a comment. There is no
`reaction` kind and there must not be one (`PRODUCT.md` § Notifications). It is
one tap and it is meant to cost the person leaving it nothing, which it stops
doing the moment it costs somebody else an email.

**A suppressed address still gets sign-in codes.** The suppression check runs
at claim time against `email_suppressions` and is skipped for, and only for,
`kind = 'sign_in_code'`. A spam complaint must never lock a family member out
of their own archive, and the repeated failure is itself the diagnostic
(`data-models.md` § `outbound_emails`). Every other kind to a suppressed address
is written, then set `state = 'suppressed'` without a send, and counted on
`GET /api/mail/health`.

**The sign-in path never surfaces a mail failure to the person typing an
address.** Leaking "we could not send to that address" turns the form into a
membership oracle. Enqueue failures are invisible to that route and visible
only in the admin banner.

**The footer's "turn these emails off" link is rendered for the seven
suppressible kinds and omitted for `sign_in_code`**, because offering to turn
off a message that cannot be turned off is a lie. Surface 16's plain-text code
already omits it; its HTML frame shows the shared footer and is the frame, not
the contract.

**Formatted dates.** The conventions forbid a formatted or relative date
string in a payload, and that rule holds here: `payload_json` carries
`YYYY-MM-DD` and ISO instants only. The renderer formats them, against
`payload.timezone` and the Shoebox's one locale, because an email has no
browser and no reader locale to defer to. `outbound_emails.subject` stores the
already-rendered string, since that column is the message rather than a
payload.

### The enqueue interface

```ts
type OutboundEmailKind =
  | "sign_in_code"
  | "invitation"
  | "upload_session"
  | "comment"
  | "removal_request"
  | "removal_reminder"
  | "removal_resolved";

/** On every payload. Resolved at enqueue so rendering is a pure function. */
type EmailCommon = {
  shoeboxName: string;
  /** Absolute, from `public.base_url`. No message is renderable without it. */
  baseUrl: string;
  /** IANA zone from `shoebox.timezone`, frozen so a setting change cannot
   * move a queued batch's day. */
  timezone: string;
  /** The recipient's own name, for the greeting. Null falls back to nothing. */
  toDisplayName: string | null;
  /** Null for `sign_in_code`, which has no switch to offer. */
  preferencesUrl: string | null;
};

type EnqueueEmailInput<K extends OutboundEmailKind, P extends EmailCommon> = {
  kind: K;
  /** Normalised. Denormalised onto the row so it survives a later change. */
  toAddress: string;
  toMemberId: string | null;
  /** Verbatim from the recipe table below. `UNIQUE`, and the only thing
   * standing between a retried handler and 200 duplicate emails. */
  idempotencyKey: string;
  /** Rendered English, stored on the row. */
  subject: string;
  payload: P;
  /**
   * No foreign key: the trigger can be deleted and the record must outlive it.
   */
  triggerKind:
    | "sign_in_code"
    | "invitation"
    | "upload_session"
    | "comment"
    | "removal_request"
    | "item";
  triggerId: string;
  /** Defaults to now. The reminder job is the only caller that sets it. */
  sendAfter?: string;
};
```

### Claiming, retrying and scrubbing

Claiming a row is, verbatim:

```sql
UPDATE outbound_emails SET state = 'sending' WHERE id = ? AND state = 'queued'
```

and the worker proceeds only if `changes() = 1`. Selection is
`WHERE state = 'queued' AND send_after <= :now AND (next_attempt_at IS NULL OR
next_attempt_at <= :now)`. The claim is the whole of the concurrency control:
SQLite serialises writers, so two workers cannot both win.

`sign_in_code` rows are scrubbed once terminal (`data-models.md` §
`outbound_emails`): `payload_json` is rewritten to `{}`. **The scrub must also
rewrite `subject`**, because surface 16 deliberately puts the digits in the
subject line so the code reads from a lock screen, and a permanent log of
live-looking codes is exactly what storing `sign_in_codes.code_hash` as an
HMAC exists to prevent. The scrubbed subject is `Your code`.

`email_delivery_events` takes provider webhooks with
`UNIQUE (email_id, event, occurred_at)` for replay safety, and
`delivery_state` on the row is what `GET /api/mail/health` reads for bounces.

### When `public.base_url` is unset

The enqueue reads the key once. If it is missing, empty, or not an absolute
URL, the enqueue **writes its row anyway** with `state = 'failed'`,
`attempts = 0`, `last_error_code = 'base_url_unset'` and a
`last_error_message` naming the key, and the triggering transaction commits.

It must not throw, because the triggering transaction is doing something else
that has to succeed: the upload latch is deliberately on `settled_at` rather
than `notified_at` so a batch can finish while mail is down
(`data-models.md` § Exactly one email when the last file lands), and a sign-in
code that cannot be mailed must still exist for the resend path.

The consequence is stated rather than mitigated: those messages are lost, not
retried. Where a surface offers a resend (an invitation's "Send it again",
incrementing `send_count` and so producing a new idempotency key) the admin can
recover one; where no surface does (upload, comment, removal) nobody can.
`GET /api/mail/health` therefore reports `isBaseUrlSet: false` above every
other diagnostic, because every other symptom is downstream of it, and a fresh
Shoebox holds zero settings rows so this fires on the very first invitation,
which is when an admin is watching.

### Recipient resolution is one set operation, never a loop

This is the expensive part and the easiest thing to write as nine queries
(`data-models.md` § Recipients). For a batch, three queries total, independent
of the number of members:

```
1.  R = SELECT DISTINCT visibility_rule_id FROM items
          WHERE upload_session_id = :sessionId
    N = SELECT visibility_rule_id, count(*) AS n FROM items
          WHERE upload_session_id = :sessionId GROUP BY visibility_rule_id
    (one query; |R| rows, and |R| = 1 in the normal case because one upload
     is one visibility decision)

2.  C = SELECT id, email, display_name, role FROM members
          WHERE status = 'active' AND notify_on_upload = 1 AND id <> :actorId
    (one query, nine rows)

3.  V = the expansion of every candidate to their visible rule set, as one
        query over group_members joined to visibility_rule_subjects, not one
        query per member. Reuse the cached expansion per
        (member_id, visibility_generation) where the middleware already has it.

4.  For each candidate: I = R intersect V(member). An admin intersects trivially:
    they see everything, so I = R.
    Recipients are the candidates whose I is not empty.

5.  visibleItemCount(member) = the sum of N[r] for every r in I.
```

Step 5 is the whole of Decision 4 and it costs nothing extra: the per-member
count falls out of the same intersection that decided who to send to. Inés gets
3, Abuela gets 210, and one `outbound_emails` row is still one message. The
`upload-narrowed` state of surface 16 is this and nothing else: same kind, same
template, same payload type, a different integer.

Do not add `OR uploaded_by = :member` to the intersection for the upload
fan-out; the actor is already excluded and no other candidate uploaded the
batch. The clause does matter for the comment and removal recipient sets below,
where the uploader is a recipient by name.

**The result is a snapshot.** The recipient list and every per-member count are
frozen into the rows at enqueue. If visibility changes before the message
sends, the message is stale. That is the right trade: re-evaluating at send
makes a retry non-deterministic, so the same row could mean two different
things on two attempts, and the idempotency key would be guarding nothing.

### The nine messages

| Kind                            | Idempotency key                                          | Suppressed by       |
| ------------------------------- | -------------------------------------------------------- | ------------------- |
| `sign_in_code`                  | `signin:<code_id>`                                       | none                |
| `invitation`                    | `invite:<invitation_id>:<send_count>`                    | none                |
| `upload_session`                | `upload:<session_id>:<member_id>`                        | `notify_on_upload`  |
| `comment`, to the uploader      | `comment:<comment_id>:<member_id>`                       | `notify_on_comment` |
| `comment`, to a prior commenter | `comment:<comment_id>:<member_id>`                       | `notify_on_reply`   |
| `removal_request`               | `removal:<request_id>:<member_id>`                       | `notify_on_removal` |
| `removal_reminder`              | `removal-reminder:<request_id>:<member_id>:<week_index>` | `notify_on_removal` |
| `removal_resolved`              | `removal-resolved:<request_id>:<member_id>`              | see each below      |

`removal_resolved` covers three outcomes: `deleted` and `declined` answer the
person who asked, and `withdrawn` tells the people who were asked that they can
stop. One kind, one recipe, three recipient sets.

---

#### 1. `sign_in_code`

**Trigger** `POST /api/auth/sign-in-codes` (the sign-in slice), in the same
transaction that inserts the `sign_in_codes` row. The row is written even for
an address that is not a member, so that unknown and known addresses are
indistinguishable, and **nothing is enqueued when `member_id` is null**
(`data-models.md` § `sign_in_codes`).

**Idempotency** `signin:<code_id>`. A resend supersedes the old code, which
means a new row and so a new key; `sign_in_codes.invalidated_at` is what makes
"the old one has stopped working" a state rather than a side effect.

**Recipients** exactly one: the address that was typed, normalised. Never
expanded, never a set operation, and the `members.status` rule above does not
apply because the address selects the recipient.

**Suppression** none, and this is the only kind that bypasses
`email_suppressions`.

**Payload**

```ts
type SignInCodeEmailPayload = EmailCommon & {
  /** The six digits, plaintext. Scrubbed from the row once terminal. */
  code: string;
  expiresAt: string;
  /** 10. Stated in the copy, carried so the copy cannot drift from the row. */
  expiresInMinutes: number;
  /** Always null for this kind. */
  preferencesUrl: null;
};
```

**Subject** `Your code is 410233`. The code is in the subject deliberately, so
it reads from a lock screen.

**Body renders** the six digits large and selectable; "Type it into the page
you left open. It works for ten minutes and then it stops."; the reassurance
that an unrequested code means somebody typed an address by mistake and nothing
has happened. Footer without the preferences link.

---

#### 2. `invitation`

**Trigger** the invite route and its "Send it again" action (the members slice
owns both paths), in the same transaction as the `invitations` insert or the
`send_count` increment.

**Idempotency** `invite:<invitation_id>:<send_count>`, so a deliberate resend
is a new message and a retried handler is not.

**Recipients** exactly one: the invited address, from the `members` row created
up front with `status = 'invited'`.

**Suppression** none of the four switches covers an invitation, and a member
who cannot be told they were invited cannot arrive. Address suppression does
apply: an invitation to a suppressed address is written `suppressed`, and that
is the one suppression an admin should see, because they just pressed a button
expecting something to happen.

**Payload**

```ts
type InvitationEmailPayload = EmailCommon & {
  inviterDisplayName: string;
  /** Shown for attribution in an email that survives forever. */
  inviterEmail: string;
  /** The address to type on the join page, so the field arrives pre-filled. */
  invitedAddress: string;
  /** `${baseUrl}/join?address=<encoded>`. Carries no credential. */
  joinUrl: string;
  /** Seven days (`invitations.expires_at`). */
  expiresAt: string;
  /** What this invitee will be able to see, computed with their own
   * expansion exactly as Decision 4 computes the upload count. */
  visibleItemCount: number;
  /** Member identities are not visibility filtered, so this is the real one. */
  memberCount: number;
};
```

**Subject** `Papá has added you to My Shoebox`.

**Body renders** the inviter's name and the Shoebox name; what it holds
(`visibleItemCount`, `memberCount`); that there is nothing to install and no
password; the join button; the invited address in bold and the promise of a
six-digit code; the seven-day expiry; the inviter's address.

**Note** the mockup prints 2,147, the archive's true size. `visibleItemCount`
is the invitee's own figure, for the same reason the upload count is: a shared
total states how much exists beyond what the reader can open. For a new member
with no group memberships that is every item on an `everyone` rule, which in a
normal Shoebox is nearly all of them. Ruled in Rulings.

---

#### 3. `upload_session`

**Trigger** the settle latch (`data-models.md` § Exactly one email when the last
file lands), run after every terminal `upload_files` transition by whichever
caller wins `changes() = 1`, in the same transaction. The upload slice's
per-file completion write reaches it, and so do the commit, presign when it
cancels a duplicate, and the `upload-abandon-sweep` job (conventions § The job
runner), which is how a closed browser still tells nine people about the 200
that did arrive. Step 6a built all four through one function.

**Idempotency** `upload:<session_id>:<member_id>`. One row per recipient, which
is what makes a per-recipient count possible without a second message to
anybody.

**Recipients** every active member who can see at least one item in the
session, minus the uploader, minus anyone with `notify_on_upload = 0`. The set
operation is written out above.

**Suppression** `notify_on_upload`.

**Payload**

```ts
type UploadSessionEmailPayload = EmailCommon & {
  uploaderDisplayName: string;
  /** THIS recipient's figure. Decision 4. Never a batch total. */
  visibleItemCount: number;
  /** The day carrying most of this recipient's visible items, the earliest
   * winning a tie. */
  capturedOn: string;
  /** Visible distinct days in the batch. 1 in every mocked state. */
  visibleDayCount: number;
  /** The earliest and the latest of those days, added in step 6a: the
   * multi-day copy names the span, and rendering takes the payload alone.
   * Equal to each other and to `capturedOn` on a one-day batch. */
  firstCapturedOn: string;
  lastCapturedOn: string;
  /** `${baseUrl}/?at=${lastCapturedOn}`: the timeline started at the batch's
   * newest visible day, which is the start position the jump rail writes.
   * This first said `${baseUrl}/day/${capturedOn}`, and there is no `/day/`
   * route. */
  dayUrl: string;
  /** The milestone band on `lastCapturedOn`, the day the link opens at, if
   * any. The multi-day copy calls it "the last of them". This first said the
   * band on `capturedOn`; on a one-day batch the two are the same day.
   * Milestones have no visibility of their own, so this needs no filtering
   * (Decision 5). */
  milestoneName: string | null;
};
```

**Subject** `Papá put up 210 photos from 14 September`, and to Inés
`Papá put up 3 photos from 14 September`. Both interpolate
`visibleItemCount`.

**Body renders** the uploader's name and the recipient's count; the weekday and
date; the milestone name when there is one; the day link; the line that says
this is one email for the whole lot and only ever arrives when a batch
finishes, which is load-bearing copy, because a member who fears 210 emails
turns notifications off forever; and the reason line, "you can see at least one
of them".

**Note** `visibleDayCount > 1` has no mocked copy. See Rulings.

---

#### 4. `comment`

**Trigger** `POST /api/items/:itemId/comments` (the item and conversation
slice), in the same transaction as the comment insert.

**Idempotency** `comment:<comment_id>:<member_id>`.

**Recipients** the item's uploader, plus every member who has already commented
on that item, minus the comment's author, de-duplicated by member id **before**
the switch test so that an uploader who has also commented gets one message and
not two. Each recipient must still be able to see the item under the standard
predicate, so somebody who has lost access is not told there is new
conversation on it. A person is only ever a `commenter` recipient by having
written on the item themselves; a people tag is never a key and must not be
consulted here either (Decision 7).

**Suppression** chosen per recipient by their strongest relationship to the
item, uploader first: the uploader's copy is governed by `notify_on_comment`,
a prior commenter's by `notify_on_reply`. There is no threading
(`comments` has no `parent_comment_id`); a "reply" is another top-level comment
on the same item.

**Payload**

```ts
type CommentEmailPayload = EmailCommon & {
  authorDisplayName: string;
  /** The comment exactly as it was sent. Decision 8. */
  body: string;
  /** Videos: the pinned position, seconds. Null on a photograph. */
  atSeconds: number | null;
  itemCapturedOn: string;
  itemUrl: string;
  /** Chooses the subject and the reason line. */
  relation: "uploader" | "commenter";
  uploaderDisplayName: string;
};
```

**Subject** `Abuela Rosa wrote on one of your photos` for the uploader. For a
prior commenter the same template with "on a photo you wrote on"; that variant
is not mocked (Rulings).

**Body renders** the author's name; whose photo and when it was taken; the
comment itself, quoted, because a grandmother who never opens the link still
reads what was said; the link; and the line saying everyone else who has
written on it got one email each, not one per reply.

**The limit, stated because it cannot be fixed.** The email quotes the comment
as it was sent, and an edit cannot catch a message already delivered
(Decision 8). Editing a comment therefore does **not** touch `outbound_emails`:
it does not rewrite a queued payload and it does not cancel a row, because the
message was true when it was enqueued and cancelling would make the
delivered-or-not boundary a race. The `editedAt` marker in `CommentDto` is the
only place the difference is visible, and only to somebody who opens the item.

Deleting a comment is the one exception: it cancels any row not yet claimed,
`UPDATE outbound_emails SET state = 'cancelled' WHERE trigger_kind = 'comment'
AND trigger_id = :commentId AND state = 'queued'`, so a message does not arrive
quoting something that no longer exists at a link that no longer shows it. A
row already `sending` or `sent` is left alone. Ruled in Rulings as an
inference.

---

#### 5. `removal_request`

**Trigger** `POST /api/removal-requests` (the removal slice), in the same
transaction as the `removal_requests` insert.

**Idempotency** `removal:<request_id>:<member_id>`. The partial unique
`removal_requests (item_id, requested_by_member_id) WHERE state = 'open'`
already forbids a second open request from one person on one photograph, so
this key cannot collide within a request.

**Recipients** the item's uploader plus every active admin, minus the
requester. **The uploader comes from `removal_requests.item_uploader_member_id`,
the snapshot, not from a join to `items`**, for the same reason the uploader's
queue is scoped that way: `item_id` is `SET NULL` and a join drops the row in
exactly the case that matters.

**Suppression** `notify_on_removal`, which is admins and uploaders only; a
viewer never receives one.

**Payload**

```ts
type RemovalRequestEmailPayload = EmailCommon & {
  requesterDisplayName: string;
  /** From `item_people` at enqueue. The copy's "She is tagged in it". */
  isRequesterTagged: boolean;
  /** `removal_requests.reason`, optional by design. */
  reason: string | null;
  /** Snapshot `removal_requests.item_captured_at`, as a local day. */
  itemCapturedOn: string;
  /** `items.created_at` as a local day. The copy's "You put it up on". */
  itemUploadedOn: string;
  uploaderDisplayName: string;
  /** `${baseUrl}/requests`. */
  requestsUrl: string;
  /** "you put it up" against "an admin is copied on this". */
  relation: "uploader" | "admin";
};
```

**Subject** `Inés has asked for a photo to come down`.

**Body renders** the requester's name; that she is tagged in it; when the
recipient put it up; her reason, quoted, when there is one; the lead fact in
bold that **nothing has happened to the photo** and everybody who could see it
still can, because that is the thing the uploader will otherwise assume
wrongly; the link; and that delete or decline are both fine but silence is not.

**Note** the copy says "You put it up on 14 September 2026", which is an upload
date, while the only snapshot the schema keeps is the capture date. Both are
resolvable at enqueue because the item still exists then, so the payload
carries both and the template can stop conflating them.

---

#### 6. `removal_reminder`

**Trigger** the `removal-reminder` job, hourly, blind
`INSERT ... ON CONFLICT DO NOTHING` (conventions § The job runner). No slice
owns it and it holds no scheduler state.

**Idempotency** `removal-reminder:<request_id>:<member_id>:<week_index>` with
`week_index = floor((now - request.created_at) / 7 days)`, which makes two
reminders in one week arithmetically impossible.

**The job must also require `week_index >= 1`.** Week zero is the week of the
request itself, during which `removal_request` already went out; without the
guard the first reminder lands within the hour of asking. The week boundary
resolves in `shoebox.timezone`, which is the third place that setting fixes a
clock that previously had none.

**Recipients** re-evaluated at every firing, not snapshotted from the original
request, because the admin set may have changed during the week: the snapshot
uploader plus every active admin, minus the requester, while
`removal_requests.state = 'open'`.

**Suppression** `notify_on_removal`.

**Payload**

```ts
type RemovalReminderEmailPayload = EmailCommon & {
  requesterDisplayName: string;
  reason: string | null;
  /** When they asked. The copy's "a week ago, on 14 September 2026". */
  requestedOn: string;
  /** 1 for the first reminder. Lets the copy escalate if it ever should. */
  weekIndex: number;
  requestsUrl: string;
  relation: "uploader" | "admin";
};
```

**Subject** `Inés is still waiting on that photo`.

**Body renders** that she asked a week ago and nothing has happened; her
reason, quoted; the link; and that this will keep arriving once a week until
somebody deletes it or says why not, **because she has no way of knowing
whether anybody saw it**. This is the one email in the product that chases, and
it says so.

---

#### 7. `removal_resolved`, outcome `deleted`

**Trigger** `DELETE /api/items/:itemId` when the item has open removal
requests, and the delete path on the removal queue (the removal slice owns
both), in the same transaction as the state change. **Deleting acts on every
open request for that item, not just the one being answered**, so one delete
can enqueue several requests' worth of messages.

**Idempotency** `removal-resolved:<request_id>:<member_id>`. The key does not
mention the outcome and does not need to: `CHECK ((state = 'open') =
(resolved_at IS NULL))` means a request resolves exactly once, and "Ask again"
after a decline creates a new request row with a new id.

**Recipients** the requester always; the uploader as well when the item came
down, minus the actor, so an uploader who deleted it themselves is not told
what they just did and an admin acting first means the uploader is.

**Suppression** the uploader's copy is governed by `notify_on_removal`. **The
requester's copy is not suppressible by any switch.** That switch means
"somebody asks for a photograph of them to come down", which is about receiving
requests; suppressing the answer to your own request would recreate exactly the
silence the whole flow exists to avoid. Ruled in Rulings.

**Payload**

```ts
type RemovalResolvedDeletedEmailPayload = EmailCommon & {
  outcome: "deleted";
  resolvedByDisplayName: string;
  resolvedAt: string;
  itemCapturedOn: string;
  /** Chooses "you asked" against "somebody asked about yours". */
  relation: "requester" | "uploader";
};
```

**No item URL.** The item is gone, the object is gone, and a link would 404.
This is the only one of the nine with no link in it, and the mockup has none.

**Subject** `That photo has come down`.

**Body renders** who took it down and when; that it is gone, the picture and
the file behind it, and nobody in the Shoebox can open it any more; and that
the requester does not have to do anything or thank anybody, because asking was
the right thing to do. Closing the loop is what stops somebody having to work
up the nerve a second time.

---

#### 8. `removal_resolved`, outcome `declined`

**Trigger** `POST /api/removal-requests/:id/decline` (the removal slice), in
the same transaction as the state change. `decline_reason` is compulsory at the
database level (`CHECK (state <> 'declined' OR decline_reason IS NOT NULL)`),
unlike the request's own `reason`, so the payload field is not nullable.

**Idempotency** `removal-resolved:<request_id>:<member_id>`, the same recipe.

**Recipients** the requester only. The item did not come down, so there is
nothing to tell the uploader that they do not already know: they are the one
who wrote the reason.

**Suppression** none, for the reason given above.

**Payload**

```ts
type RemovalResolvedDeclinedEmailPayload = EmailCommon & {
  outcome: "declined";
  declinerDisplayName: string;
  /** The decliner's own words, verbatim. Never a template. */
  declineReason: string;
  resolvedAt: string;
  /** May 404 for this reader if their access has since changed. */
  itemUrl: string;
};

type RemovalResolvedEmailPayload =
  | RemovalResolvedDeletedEmailPayload
  | RemovalResolvedDeclinedEmailPayload
  | RemovalResolvedWithdrawnEmailPayload;
```

**Subject** `Papá has kept that photo up, and said why`.

**Body renders** the decliner's own words, quoted and leading; the hedged line
"The photo is still there. Who can see it may have changed", which is
deliberately hedged and takes no field, because the software does not know
whether the decliner narrowed the visibility while they were there; the link;
and that asking again or telling an admin is fine and nobody will think less of
them. A no with a reason is a conversation; a no without one is the phone call
this flow exists to prevent.

**The link is not a grant.** If the requester can no longer see the item, the
permalink returns 404 exactly as it does everywhere else, and that is correct
behaviour rather than a bug to patch with a token.

---

#### 9. `removal_resolved`, outcome `withdrawn`

**Trigger** `POST /api/removal-requests/:requestId/withdraw` (the removal
slice), in the same transaction as the state change. Withdrawing is a
resolution like the other two, so it goes through the same kind rather than a
ninth one: no new `OutboundEmailKind` value, no new suppression mapping, and
no new idempotency recipe.

**Idempotency** `removal-resolved:<request_id>:<member_id>`, the same recipe.
`CHECK ((state = 'open') = (resolved_at IS NULL))` means a request resolves
exactly once, so the key cannot collide with a later decline or delete of the
same request: there is no later one. Asking again creates a new request row
with a new id.

**Recipients** the uploader and every admin, minus the actor. This is the
mirror of `removal_request` rather than of the other two outcomes: those answer
the person who asked, and this one tells the people who were asked that they
can stop. The uploader comes from
`removal_requests.item_uploader_member_id`, the same snapshot column
`removal_request` reads, so a later change of uploader cannot redirect the
close of a conversation that has already happened. The requester is always the
actor, because nobody else may withdraw, and so is never a recipient of their
own withdrawal.

**Suppression** `notify_on_removal`, the same switch that governed the request
and the weekly reminder. Somebody who has turned off "a photograph of me should
come down" has turned off this whole conversation, and the withdrawal is its
quietest message. This differs from `deleted` and `declined`, whose recipient
is the asker and is unsuppressible; here the recipient is the asked.

**Payload**

```ts
type RemovalResolvedWithdrawnEmailPayload = EmailCommon & {
  outcome: "withdrawn";
  /** Always the requester: nobody else may withdraw. */
  withdrawnByDisplayName: string;
  resolvedAt: string;
  /** Snapshot `removal_requests.item_captured_at`, as a local day. */
  itemCapturedOn: string;
  /** Still resolvable, because nothing came down. May 404 for this reader if
   * their access has since changed, which is correct rather than a bug. */
  itemUrl: string;
};
```

**No reason field, deliberately.** The route takes no body and
`removal_requests` has no column for one. "Never mind" does not need an
explanation, and asking for one would turn withdrawing into a second thing to
justify, which is the friction that leaves requests open instead.

**Subject** `Never mind about that photo`.

**Body renders** who withdrew and when; that the request is closed and there is
nothing to do; that the photograph is untouched and nobody took anything down,
which is the sentence the reader actually wants; and the link. It does not
thank, apologise, or speculate about why. The whole message is the removal of a
task, and any extra sentence makes it read like a new one.

**The weekly reminder stops arithmetically**, not because this message says so.
`removal-reminder` matches on `state = 'open'` and the row is no longer open,
so the nagging ends whether or not this message is suppressed for a given
reader.

```ts
type OutboundEmailPayload =
  | SignInCodeEmailPayload
  | InvitationEmailPayload
  | UploadSessionEmailPayload
  | CommentEmailPayload
  | RemovalRequestEmailPayload
  | RemovalReminderEmailPayload
  | RemovalResolvedEmailPayload;
```

---

# Part 2: the HTTP routes

## Why every one of these is admin-only

**View data is admin-only** (`data-models.md` § Privacy, Decision 11). A member
seeing that her son opened her photograph fourteen times and said nothing would
change the character of the product in a way nothing in the spec asks for. An
anonymous aggregate is not a compromise: with nine members, "seen by six"
plus a visible reaction list narrows to a name. The one exception is that **a
member may read their own full record**, which is about them and reveals
nothing about anybody else, and is the same principle as the unseen dot.

**These routes return 403, not 404, for the role restriction**, which is the
deliberate exception to the counting rule's usual answer. They address members
and settings the caller can already see: every member sees every other member's
name on chips, in comment authorship and in reaction popovers, and every admin
sees the settings. Nothing is concealed by pretending the row does not exist,
so the honest status is the one that says "this exists and your role forbids
it" (conventions § Errors: 403 is role only).

`GET /api/items/:itemId/viewers` is the exception to the exception. It takes an
item-derived id, so an item the caller may not see returns a 404 byte-identical
to a nonexistent id: same status, same code, same message. The role check runs
**after** the visibility check, never before, or the 403 would confirm that
something exists at that id.

## Presence

#### `GET /api/presence`

**Surface** 17 `presence`, states `default`, `never-arrived`
**Auth** session required · **Role** self-or-admin
**Request**

```ts
type PresenceRequest = {
  /** Query, optional. An admin omitting it gets every member; anybody else
   * omitting it gets their own row. A non-admin may only pass their own id. */
  memberId?: string;
};
```

No `limit` and no `cursor`: the member table is bounded at tens of rows and
never paginates.

**Response** `200`

```ts
type PresenceRow = {
  member: MemberRef;
  /** Admin-scoped route, so the address is carried. See Additions requested. */
  email: string;
  status: "invited" | "active";
  /** `members.created_at`. "Invited three days ago and has not arrived." */
  invitedAt: string;
  /**
   * `members.joined_at`, their first successful sign-in. Null: never arrived.
   */
  joinedAt: string | null;
  /** `members.last_signed_in_at`, written when a code is redeemed. This is
   * the surface's "Last signed in". Null is a designed state, not a missing
   * row: it means they have never signed in. */
  lastSignedInAt: string | null;
  /** `members.last_seen_at`, their last authenticated request. This is the
   * Members table's "Last seen" and it is NOT the field above. Under a 30-day
   * sliding session the two differ by up to a month, and both are wanted. */
  lastSeenAt: string | null;
  /** Days on which they left a durable mark: saw something new, opened
   * something, wrote a comment, or left a reaction. See Transformations. */
  activeDaysCount: number;
  /** 90. On the row because the collection envelope is fixed by the
   * conventions and nine copies of one integer cost nothing. */
  activeDaysWindowDays: number;
  /** Distinct items opened at full size. Scrolling past is not opening. */
  itemsOpenedCount: number;
  commentsWrittenCount: number;
  /** Item reactions plus comment reactions, summed. */
  reactionsLeftCount: number;
};

type PresenceResponse = {
  presence: PresenceRow[];
  /** Always null. This collection does not paginate. */
  nextCursor: null;
};
```

**Errors**

| Status | Code                 | When                                                                                                                                                                         |
| ------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401    | `not_signed_in`      | No session, or an expired one                                                                                                                                                |
| 403    | `presence_forbidden` | A non-admin passed a `memberId` that is not their own. **403 and not 404**: member identities are not visibility filtered, so no 404 is owed, and this is a role restriction |
| 404    | `member_not_found`   | No member with that id, at any role                                                                                                                                          |

**Transformations**

- Rows are members with `status IN ('invited','active')`. A removed member is
  not listed; their history belongs to the Members surface, not to a question
  about who is present now.
- **Ordering is server-side**, by who is most present:
  `activeDaysCount DESC, itemsOpenedCount DESC, commentsWrittenCount DESC,
lastSignedInAt DESC NULLS LAST, displayName ASC`. Somebody who has never
  signed in sorts last, which is what makes the `never-arrived` state the
  bottom of the same list read upwards. There is no `quiet=true` filter: the
  mockup's threshold is a presentational judgement, and nine rows always arrive
  in one page.
- **Every figure computes live**, one grouped query per column, from
  `item_views`, `comments` and the two reaction tables. `member_active_days`
  stays deferred (`data-models.md` § `member_active_days`); see Performance for
  the condition that builds it.
- `itemsOpenedCount` is `count(*) FROM item_views WHERE first_opened_at IS NOT
NULL GROUP BY member_id`. Because `item_views.item_id` is `CASCADE`, deleting
  a photograph silently lowers everybody's figure: the count means "items that
  still exist and you opened", not "opens ever". That is the right meaning for
  a question about the present.
- `commentsWrittenCount` counts live comments only. A deleted comment is hard
  deleted, and a comment on a deleted item cascades with it.
- **`activeDaysCount` has a precise and slightly surprising definition**, and
  it has to be written down. There is no per-day activity record, and
  `item_views` deliberately has **no `last_seen_at`**: maintaining one would
  reintroduce a write on every impression, which is the entire cost the
  one-row-per-(member, item) collapse avoids. So an active day is a day
  carrying at least one of `item_views.first_seen_at`,
  `item_views.first_opened_at`, `item_views.last_opened_at`,
  `comments.created_at`, `item_reactions.created_at`,
  `comment_reactions.created_at` for that member, `UNION`ed and counted
  distinct over the last 90 days. A day spent re-reading a familiar archive,
  opening nothing new and writing nothing, leaves no trace anywhere and is not
  counted. Nobody should "fix" that by adding `last_seen_at`.
- **The day boundary resolves in `shoebox.timezone`**, not UTC
  (`data-models.md` § `settings`). SQLite has no IANA zone support, so the
  server passes the offsets that apply across the window and accepts a
  one-hour edge on the two days a year the offset changes, which can move a
  single mark between adjacent days in a 90-day count.
- For the self case, the counts are **not** re-filtered through the caller's
  current visibility predicate. They are that member's own history; re-filtering
  would make their own record change when somebody else's group membership
  changed, and it reveals nothing about items they have not opened.

**Performance**

- Five queries, regardless of member count, and no query inside a loop.
  `members` is nine rows; `comments` and the two reaction tables group over
  thousands.
- **The one query here that scales with the archive** is the `item_views`
  grouping. `UNIQUE (member_id, item_id)` cannot serve it, because
  `first_opened_at` is not in the index, so it is a scan of a table bounded at
  members times items (about 290k rows after a decade). It wants a partial
  index on `(member_id) WHERE first_opened_at IS NOT NULL`, requested in Open
  questions. The `activeDaysCount` union reads the same table three more times.
- **The condition that builds `member_active_days`** is this query, not a
  guess: when the union above stops returning in single-digit milliseconds, or
  when `item_views` passes roughly a quarter of a million rows, whichever comes
  first. It is derivable from exactly these tables, so it can be backfilled and
  is not a migration to fear. Do not build it now.

#### `GET /api/items/:itemId/viewers`

**Surface** 17 `presence` state `one-item`, and 3 `photo` state `who-opened`
**Auth** session required · **Role** admin, after the item's visibility check
**Request**

```ts
type ItemViewersRequest = {
  /** Path. */
  itemId: string;
};
```

**Response** `200`

```ts
type ItemViewerRow = {
  member: MemberRef;
  /** Opened at full size. **The distinction the owner cares about**, so it is
   * a field rather than something inferred from a null timestamp. */
  hasOpened: boolean;
  /** When it first went past them in the pile. Null means it never has: they
   * can see it and have not yet reached it. Set once, never updated. */
  firstSeenAt: string | null;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
};

type ItemViewersResponse = {
  viewers: ItemViewerRow[];
  /** Always null. At most tens of rows. */
  nextCursor: null;
};
```

**Errors**

| Status | Code                 | When                                                                                                                                                     |
| ------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401    | `not_signed_in`      | No session, or an expired one                                                                                                                            |
| 404    | `item_not_found`     | No item with that id, **or the viewer's predicate excludes it**. Byte-identical in both cases: same status, same code, same message. Checked first       |
| 403    | `presence_forbidden` | The item is visible to the caller and they are not an admin. Checked only after the 404 above, or the 403 would confirm that something exists at that id |

**Transformations**

- **The rows are the eligible members, not the `item_views` rows.** One row per
  member whose visibility admits this item, left joined to their view record.
  That is what gives surface 17 its denominator ("Five of the seven people who
  can see this have opened it") without a second field: the denominator is
  `viewers.length` and the numerator is the rows with `hasOpened`.
- Three distinct states, all explicit: opened (`hasOpened`), scrolled past and
  never opened (`firstSeenAt !== null && !hasOpened`), and not yet reached
  (`firstSeenAt === null`). Surface 17 prints the second as "Scrolled past,
  never opened".
- Eligibility is the standard evaluation, applied to the item's single rule:
  admins always; the uploader always (`items.uploaded_by`, Decision 7);
  `mode = 'everyone'`; `only` and the member is among the expanded subjects;
  `except` and they are not. **`item_people` must not appear here**: being in a
  photograph is not a key to it, and this is exactly the surface where somebody
  will be tempted to list the people tagged in it.
- A removed member is listed only when they actually opened it, so a decade of
  somebody's attention does not silently vanish from the record; they are never
  listed merely as eligible.
- **Ordering puts people who opened it above people who merely scrolled past**,
  which is the whole point of the panel: `hasOpened DESC, openCount DESC,
lastOpenedAt DESC`, then the seen-not-opened rows by `firstSeenAt ASC`, then
  the unseen rows by `displayName ASC`.
- The print itself and its capture time are not here. Both surfaces render this
  panel beside an item they already have, so the item route serves the
  `MediaRef`; this route costs one extra request and carries no media.

**Performance**

- One range scan of at most tens of rows on `(item_id, member_id)`, plus one
  nine-row read of `members`.
- Eligibility is **one query, not one per member**. The item has exactly one
  `visibility_rule_id`, so a single query expands that rule's subjects through
  `group_members` into a member set, and the mode is applied to it in
  application code. This is the same set operation the upload recipient query
  does, read in the other direction.
- No N+1 anywhere: do not call a "can this member see this item" helper in a
  loop over members.

## Activity

#### `GET /api/activity`

**Surface** 18 `changes`, states `default`, `authority`, `person`, `gone`,
`empty`
**Auth** session required · **Role** admin
**Request**

```ts
/**
 * The three families of `activity_events.kind`, which are the surface's
 * filter. `authority` is the one the log exists for: nothing else in the
 * product records a change to who may see what.
 */
type ActivityFamily = "authority" | "destruction" | "access";

type ActivityRequest = {
  /** Query. Default 50, capped at 200. */
  limit?: number;
  /** Query. Opaque. Encodes `occurredAt` and the row's uuidv7 id, because
   * `occurredAt` alone is not unique. */
  cursor?: string;
  /**
   * Query. Who did it. Uses `activity_events (actor_member_id, occurred_at
   * DESC)`.
   */
  actorMemberId?: string;
  /** Query. What it was done to, including a dangling id from a deleted item.
   * Uses `activity_events (subject_kind, subject_id, occurred_at DESC)`. */
  subjectId?: string;
  /** Query. Omitted means every family. Uses
   * `activity_events (kind, occurred_at DESC)`, which exists and until now
   * had no caller. */
  family?: ActivityFamily;
};
```

**This route reads `activity_events` and nothing else.** It was specified as a
`UNION ALL` over five tables, and surface 18 narrowed it: comments, reactions
and uploads are visible in the timeline already, and a log that repeats them
buries the row that matters. The table's own justification is that it records
**only what the state tables cannot answer later** (`data-models.md` §
`activity_events`), and the route now matches that exactly.

**Response** `200`

```ts
/** Deliberately NOT a `MemberRef`. See Transformations. */
type ActivityActor = {
  /** Null when the member row is gone or was never set (`SET NULL`). */
  memberId: string | null;
  /** `activity_events.actor_label`, the name and address as they were. */
  label: string;
};

type ActivitySubject = {
  kind:
    | "item"
    | "member"
    | "group"
    | "comment"
    | "milestone"
    | "setting"
    | "session";
  /** May be a dangling uuid: a deleted item's row keeps its id on purpose.
   * The client must not assume it resolves and must not link to it blindly. */
  id: string | null;
  label: string;
};

/** Narrow and per-kind. `detail_json` is never passed through raw. */
type ActivityDetail =
  | { kind: "member_role_changed"; fromRole: string; toRole: string }
  | {
      kind: "group_membership_changed";
      addedLabels: string[];
      removedLabels: string[];
    }
  | {
      kind: "item_visibility_changed";
      fromLabel: string | null;
      toLabel: string | null;
    }
  | {
      kind: "setting_changed";
      settingKey: string;
      fromValue: string | null;
      toValue: string | null;
    };

type ActivityEntryDto = {
  /** `activity_events.id`. There is one source, so it needs no prefix. */
  entryId: string;
  /** An `activity_events.kind`, verbatim. Surface 18 prints it. */
  kind: string;
  family: ActivityFamily;
  occurredAt: string;
  actor: ActivityActor;
  subject: ActivitySubject;
  /** `activity_events.device_label`, denormalised at write time like
   * `actor_label` and `subject_label` beside it (Rulings 7). Null only when
   * the event recorded no device. Do not resolve it through `sessions`:
   * those fall out at 30 days idle, which is most of the log. */
  deviceLabel: string | null;
  detail: ActivityDetail | null;
};

type ActivityResponse = {
  activity: ActivityEntryDto[];
  nextCursor: string | null;
};
```

**Errors**

| Status | Code                 | When                                                                                                       |
| ------ | -------------------- | ---------------------------------------------------------------------------------------------------------- |
| 401    | `not_signed_in`      | No session, or an expired one                                                                              |
| 403    | `activity_forbidden` | Signed in, not an admin. 403 and not 404: the feed is a surface, not a row, and this is a role restriction |
| 400    | `invalid_request`    | `limit` out of range, or an undecodable `cursor`                                                           |

**Transformations**

- **One table, one `SELECT`.** No union, no derived branches, no second source
  of truth. Every row is an `activity_events` row, and `family` is computed
  from `kind` by the table below, in code rather than in a column, because the
  grouping is a presentation of the kinds rather than a fact about them.

  | Family        | Kinds                                                                                                                                                                                                                               |
  | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `authority`   | `member_invited`, `invitation_revoked`, `invitation_accepted`, `member_role_changed`, `member_removed`, `group_created`, `group_renamed`, `group_membership_changed`, `group_deleted`, `item_visibility_changed`, `setting_changed` |
  | `destruction` | `item_deleted`, `comment_deleted`, `milestone_deleted`                                                                                                                                                                              |
  | `access`      | `sign_in_code_requested`, `signed_in`, `sign_in_failed`, `signed_out`, `device_revoked`, `session_expired`                                                                                                                          |

  These are `data-models.md` § `activity_events`'s own three families,
  unchanged. A new kind must be added to this table in the same change that
  adds it to the schema, and the mapping is exhaustive rather than defaulted:
  an unmapped kind is a bug that should fail loudly, not a row that quietly
  lands in `access`.

- **Comments, reactions and uploads are not here, and this is the design.**
  Those three facts are not logged because another table already knows
  (`data-models.md` § What is not logged), and surface 18 does not ask for
  them: the timeline shows every comment, every reaction and every upload
  already. Adding them back would mean either a five-table union whose noisiest
  branches bury the authority rows, or copying them into `activity_events` and
  creating a second source of truth that can drift. Neither is worth an
  admin-only screen repeating what the archive shows on its front page.

- **`activity_events.subject_id` has no foreign key, deliberately.** An audit
  log outlives its subjects, so an `item_deleted` row holds a dangling id, and
  referential integrity here would either forbid the row or cascade it away
  exactly when it becomes valuable. Orphan ids are expected and correct.
- **The DTO reads the labels and never joins to resolve them.** `actor_label`
  and `subject_label` are denormalised so the log reads correctly with no join
  after the rows are gone, and resolving them through `members` or `items`
  would break every row that matters. The four derived branches do join, for
  their own labels only, and that is safe because their subjects are alive by
  construction: a comment's author is `RESTRICT` and a reaction cascades with
  its target.
- **Every label is the name as it was**, with no exceptions, which is the
  simplification dropping the derived branches bought. The earlier five-table
  shape mixed "as it was" on event rows with "as it is" on derived ones, and
  that inconsistency is now gone rather than merely documented.
- `detail` is a narrow discriminated union, not a passthrough of
  `detail_json`. Adding a kind that needs detail means adding a variant. This
  is also the most likely place a debug field would otherwise arrive, which the
  conventions forbid.
- `group_membership_changed` earns its place more than it looks: groups expand
  at read time, so adding somebody to Cousins retroactively grants them
  everything ever restricted to Cousins. It is the most consequential invisible
  action in the product and nothing else records it. Surface 18 renders that
  consequence as a sentence under the row rather than leaving an admin to work
  it out, which is what `detail.addedLabels` is for.
- No visibility predicate is applied, because the route is admin-only and an
  admin omits the clause entirely, which is both correct and fastest.
- **No retention.** The log is a few megabytes after ten years, and the first
  question anybody asks of an audit log is about something old.

**Performance**

- **The cursor and the ordering.** `ORDER BY occurred_at DESC, id DESC` with
  `WHERE occurred_at < :cursorAt OR (occurred_at = :cursorAt AND id <
:cursorId)` and `LIMIT :limit + 1`. The extra row is what sets `nextCursor`.
  One index scan over one table, and no merge: the union's `5 x (limit + 1)`
  sort and its deep-page cost are both gone, which is the performance half of
  the narrowing.
- Index per filter, all four of which already exist and are now all used:
  `(occurred_at DESC)` unfiltered, `(kind, occurred_at DESC)` for `family`,
  `(actor_member_id, occurred_at DESC)` for `actorMemberId`, and
  `(subject_kind, subject_id, occurred_at DESC)` for `subjectId`.
- `family` filters on a set of kinds rather than one, so it is `kind IN (...)`
  against the composite index. At one to two thousand rows a year the planner's
  choice barely matters, and the index is there either way.

## Mail

#### `GET /api/mail/health`

**Surface** 11 `settings`, states `default` and `mail-failing`
**Auth** session required · **Role** admin
**Request** none. No path params, no query.
**Response** `200`

```ts
/** One actionable cause, chosen by the precedence ladder below. Never a
 * generic error, and never a raw provider string for the client to parse. */
type MailDiagnosis =
  | { code: "base_url_unset"; settingKey: "public.base_url" }
  | { code: "from_address_unset"; settingKey: "mail.from_address" }
  | { code: "domain_unverified"; domain: string; providerError: string | null }
  | {
      code: "provider_rejecting";
      providerStatus: string | null;
      providerMessage: string | null;
      failingSince: string;
    }
  | { code: "backlog"; oldestQueuedAt: string; queuedCount: number };

/** What is sitting in `outbound_emails` right now. */
type MailQueueHealth = {
  queuedCount: number;
  failedCount: number;
  suppressedCount: number;
  sentLast24hCount: number;
  /** Drives "Mail has not gone out for 3 hours". The browser formats it. */
  oldestQueuedAt: string | null;
  lastSentAt: string | null;
  lastFailedAt: string | null;
};

/** The most recent failure, from `outbound_emails`. */
type MailDeliveryFailure = {
  code: string | null;
  message: string | null;
  occurredAt: string;
  kind: OutboundEmailKind;
};

type MailHealthResponse = {
  status: "ok" | "degraded" | "failing";
  /** Null when status is "ok". */
  diagnosis: MailDiagnosis | null;
  /**
   * `mail.from_address`, `mail.from_name`, and the domain the provider
   * verifies.
   */
  fromAddress: string | null;
  fromName: string | null;
  sendingDomain: string | null;
  /** `mail.domain_verified_at`. Null means never verified. */
  domainVerifiedAt: string | null;
  /** Safe summary of `mail.domain_last_check_error` from the last check. */
  domainLastCheckError: string | null;
  /** `public.base_url` is set and absolute. False is the loudest diagnosis. */
  isBaseUrlSet: boolean;
  queue: MailQueueHealth;
  /** Null when there is no failure on record. */
  lastError: MailDeliveryFailure | null;
  /** `email_suppressions WHERE cleared_at IS NULL`. */
  suppressedAddressCount: number;
};
```

**Errors**

| Status | Code             | When                                                                                                                 |
| ------ | ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| 401    | `not_signed_in`  | No session, or an expired one                                                                                        |
| 403    | `mail_forbidden` | Signed in, not an admin. 403 and not 404: settings are a thing the caller's role gates, not a thing hidden from them |

**Transformations**

- **There is no mail-status table.** Everything here is a query over
  `outbound_emails` plus the two `mail.domain_*` settings keys
  (`data-models.md` § `outbound_emails`), with `mail.from_*` and
  `public.base_url` read through `SETTING_DEFINITIONS`, so a fresh instance
  with zero settings rows answers correctly from defaults.
- **The diagnosis ladder**, first match wins, because each later cause is a
  symptom of an earlier one and reporting the symptom sends an admin to fix the
  wrong thing:

  1. `base_url_unset`: every message is unrenderable, so nothing below matters.
  2. `from_address_unset`: nothing has an envelope sender.
  3. `domain_unverified`: `mail.domain_verified_at` is null, or the provider
     refused with a verification error. Carries the domain, which is what the
     admin types into DNS.
  4. `provider_rejecting`: verified, and the provider is refusing anyway. The
     provider's known status and an application-owned safe message are carried
     as data, so the banner can print them without parsing anything.
  5. `backlog`: nothing is failing and things are still sitting in `queued`,
     which usually means the job runner is not running.

- **Current refusal versus historical failure.** Terminal provider refusals
  diagnose `provider_rejecting` (or provider verification refusal) only inside
  the last 24 hours, using `created_at` because the queue has no precise
  `failed_at`. A queued retry with a provider error remains current regardless
  of age. Exclude internal worker codes `base_url_unset`, `from_address_unset`,
  `provider_unconfigured`, `no_template`, `render_failed` and
  `address_suppressed` from provider refusals. Configuration diagnoses still
  read current settings. `lastError` and queue aggregates retain unrestricted
  history, so an old terminal failure remains visible without asserting the
  provider is currently refusing. A newer internal failure must not hide an
  eligible queued provider refusal.

- **Error privacy applies to stored exception text too.** Rendering and
  provider exceptions can quote sign-in codes, message payloads or credentials,
  including in rows whose terminal payload was already scrubbed. Health never
  returns those raw messages or domain-check error strings. Use
  application-owned summaries; retain known SDK/internal identifiers and
  three-digit HTTP error statuses, normalize unknown codes to
  `provider_rejected`, and preserve null fields. Classify domain-verification
  refusals internally, returning a fixed safe summary. This response-only
  normalization covers existing historical rows without rewriting queue facts.

- `status` is `failing` when there is a diagnosis and nothing has sent in the
  window, `degraded` when there is a diagnosis but mail is partly getting
  through (a single suppressed address, say), and `ok` when there is none.
- **No formatted or relative string.** The surface's "has not gone out for
  3 hours" is computed in the browser from `oldestQueuedAt`, and "Last error:
  403, domain not verified" from `lastError`.
- The sign-in consequence ("Nobody new can sign in until this is fixed,
  although everybody already signed in is unaffected") is static copy, not a
  field. It follows from the architecture, not from the state of the queue.
- This is the only place a mail failure is ever surfaced. The sign-in route
  must not surface one to the person typing an address, or the form becomes a
  membership oracle.

**Performance**

- Queue aggregates use `GROUP BY state` over `outbound_emails` with `min`/`max`
  plus a sent-in-the-last-day count. Bounded row reads select the latest
  historical failure and the latest eligible current provider refusal; a count
  covers active `email_suppressions`. Settings reads touch a handful of rows.
  The provider domain list is cached for 60 seconds per domain.
- `outbound_emails` grows with everything the Shoebox does, so the grouped
  query wants `(state, created_at)`, and the worker's claim query wants
  `(state, next_attempt_at)`. Neither is declared in the data model; requested
  in Rulings.

---

## What the API deliberately cannot tell you

**This is a contract, not a note.** Everything below is absent from the
database, not filtered out of a response, so there is nothing to switch on
later and no debug flag that reveals it. A future agent adding a field here has
to add a column and a write path first, and should read this section before
deciding that is a good idea. Surface 17 renders this list to admins in as many
words, from static copy in the web app rather than from a route, because a
route that enumerated absences would be one more thing to keep in step with the
schema.

| Not recorded                                                   | What that costs, and why it is worth it                                                                                                                                                                                     |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **IP addresses and location**                                  | No column, no GeoIP lookup, no resolution to a city, nothing in the application logs. The per-IP sign-in rate limit is the one place an address is touched, in memory, never stored (conventions § Rate limits). Decision 6 |
| **Raw user agents**                                            | `sessions.user_agent` is the fallback for a wrong parse and never leaves the server; only the parsed `deviceLabel` is ever in a payload                                                                                     |
| **Dwell time, scroll depth, hover and tap coordinates**        | This is the part that would quietly turn into analytics                                                                                                                                                                     |
| **Video watch position**                                       | A pinned comment is content somebody chose to leave. Recording that Rosa stopped the clip at 0:14 eleven times is surveillance of exactly the person the product is trying to delight                                       |
| **Search and filter terms**                                    | The creepiest datum available here, and it answers none of the owner's questions                                                                                                                                            |
| **Read receipts on comments**                                  | "She saw my message and did not reply" is a family argument the software should not enable                                                                                                                                  |
| **Impressions**                                                | `item_views` is one row per (member, item), so the archive can say whether a print ever went past somebody and how many times they opened it, and can never say how many times they scrolled past it                        |
| **A last-seen time per item**                                  | `item_views` has no `last_seen_at`, deliberately: maintaining one is a write on every impression, which is the whole cost the collapse avoids                                                                               |
| **Anything separating an empty archive from an invisible one** | No `hiddenCount`, no `archiveIsEmpty`, no diagnostic field. The two are byte-identical on the wire (conventions § Forbidden in any payload)                                                                                 |

And one thing that is recorded but is not reachable through any route in this
slice: `sign_in_codes.code_hash` is an HMAC and the plaintext digits exist in
`outbound_emails.payload_json` only until that row is terminal, at which point
both the payload and the subject are scrubbed.

## Shared types in this slice

Used by more than one thing here, or by another slice calling the sender.

- `OutboundEmailKind`, `EmailCommon`, `EnqueueEmailInput`, and the seven
  payload types, united as `OutboundEmailPayload`. Defined in Part 1
  beside the message each belongs to. Four slices construct these; none of them
  may widen one.
- `PresenceRow` (`presenceRowSchema`), `ItemViewerRow` (`itemViewerRowSchema`).
  `ItemViewerRow` serves surfaces 17 and 3 unchanged; the two surfaces differ
  only in their surrounding copy.
- `ActivityActor`, `ActivitySubject`, `ActivityDetail`, `ActivityEntryDto`.
  **`ActivityActor` must not be replaced by `MemberRef`**, and this is worth a
  line because it will look like an obvious tidy-up in a diff.
  `MemberRef.displayName` is the member's name _now_, resolved by a join;
  `ActivityActor.label` is the name _as it was_, denormalised precisely so that
  the log reads correctly after the row is gone. Substituting one for the other
  reintroduces the join that `activity_events` exists to avoid and silently
  rewrites history.
- `MailDiagnosis`.

Response schema names follow the convention: `presenceResponseSchema` /
`PresenceResponse`, `itemViewersResponseSchema` / `ItemViewersResponse`,
`activityResponseSchema` / `ActivityResponse`, `mailHealthResponseSchema` /
`MailHealthResponse`.

## Additions requested to the frozen DTOs

**One.** An admin-scoped member reference carrying the address:

```ts
/** `MemberRef` plus the address, for routes that are already admin-scoped. */
type AdminMemberRef = MemberRef & {
  email: string;
};
```

Surface 17 prints each member's address under their name, and the Members
surface (another slice) needs the same thing, so this is likely to be requested
twice. Until it is settled, `PresenceRow` keeps the frozen `MemberRef` and
carries `email` as a sibling field rather than widening anything inline; if
`AdminMemberRef` lands, fold the sibling into it.

Nothing else. `ItemViewerRow` uses `MemberRef` as it stands, and this slice
serves no media, so `MediaRef` and `ItemSummary` are referenced only to say
that `GET /api/items/:itemId/viewers` deliberately does not carry them.

## Rulings

1. **The uploader does not get an email about their own upload: confirmed.**
   The actor is excluded from all five member-selected kinds. You are not told
   about the thing you just did, and the mockup already implies it: surface 8's
   `done` state says the email went to eight people out of nine members.
   `PRODUCT.md` § Notifications says "everyone who can see at least one item in
   it", which literally includes them, and that sentence means the audience
   rather than the actor.

2. **The invitation's count is the invitee's own visible count: confirmed.**
   `visibleItemCount`, on the same reasoning as Decision 4. Their role and
   their groups are set at invite, so the number is computable before they ever
   sign in, and the counting rule does not get an exception because somebody
   has not arrived yet. The mockup's 2,147 stays correct because Abuelo Tomás
   is invited with full access, which makes his visible count the archive
   total; it is his count that happens to equal it, not the total being
   printed.

3. **Deleting a comment cancels its queued email: confirmed, `queued` only.**
   A row already claimed or sent is not chased. An edit cancels nothing
   (Decision 8), because the payload froze at enqueue and the whole point of
   that snapshot is that a retry cannot produce a different message. Both are
   now stated in `data-models.md` § `outbound_emails` rather than only here.

4. **The requester's `removal_resolved` is not suppressible: confirmed.**
   `notify_on_removal` means "somebody asks for a photograph of _them_ to come
   down", which is about receiving requests. Suppressing the answer to your own
   request recreates exactly the silence the flow exists to avoid. The new
   `withdrawn` outcome is the opposite case and **is** suppressible by that
   switch, because there the recipient is the asked rather than the asker.

5. **Setting `public.base_url` requeues what failed on it, and only that.**
   The settings slice, on the write that sets the key, flips
   `outbound_emails` rows with `state = 'failed'` whose failure was
   `base_url_unset` back to `queued`, recomposing **only the absolute link
   fields** from `trigger_kind` and `trigger_id`. Nothing else in the payload
   is touched.

   This looks like a breach of the purity rule and is not. That rule exists so
   a retry cannot produce a different message because the world moved; here the
   message was never renderable at all, so there is no earlier correct version
   for the recomposed one to disagree with. **Capped at seven days**, so a base
   URL set a month late does not deliver a month of stale mail into nine
   inboxes at once.

6. **Three of the four indexes are added; the fourth is no longer needed.**
   `item_views (member_id) WHERE first_opened_at IS NOT NULL`,
   `outbound_emails (state, next_attempt_at)` and
   `outbound_emails (state, created_at)` go into `data-models.md`. The fourth,
   `(created_at DESC)` on `comments` and the two reaction tables, was for the
   activity feed paging deep through its derived branches; those branches are
   gone (ruling 8), so the need went with them.

7. **`activity_events` denormalises `device_label`: yes.** The same argument
   that already justifies `actor_label` and `subject_label`, and surface 18 is
   what makes it visible: `device_id` is `SET NULL` to `sessions`, which fall
   out at 30 days idle, so without this the log reads "device no longer known"
   on every row older than a month, which is most of the log. A one-column
   addition to a table that is already wide, sparse and append-only.

8. **`GET /api/activity`: RULED, it has a surface and it is narrower.**
   Surface 18 `changes` now designs it. Two things changed as a result. It
   reads `activity_events` alone rather than a five-table `UNION ALL`, because
   the timeline already shows every comment, reaction and upload and a log that
   repeats them buries the row that matters. And it gains a `family` filter,
   which finally gives `(kind, occurred_at DESC)` the caller it did not have.
   `ActivityEntryDto` loses `source` and gains `family`.

9. **The two unmocked variants are now drawn.** Surface 16 gains
   `comment-reply`, the comment notification to somebody who commented earlier
   rather than to the uploader, and `upload-multi-day`, a batch spanning more
   than one day (`visibleDayCount > 1`). Both are the common case rather than
   an edge: a reply is what every comment after the first produces, and surface
   8 says in its own copy that one upload is routinely several weeks. Copy
   improvised at build time is copy nobody reviewed.

10. **The window rides on the row: confirmed.** `activeDaysWindowDays` on each
    `PresenceRow`, and no third top-level key on a collection. The envelope is
    `{ <resourceKey>, nextCursor }` and stays that way: the redundancy of
    repeating a constant per row costs nothing, and one exception to an
    envelope is how a contract ends up with four.
