# Removal requests

A visible, people-tagged member may ask for an item to come down, including an
uploader or admin. Tags never grant access. Invisible and missing items produce
the same `item_not_found` response. Asking snapshots the uploader, capture
instant, and original storage key. The private key is never returned.

Requests are private to the requester, snapshot uploader, and admins. Request-ID
reads use this scope independently of current item visibility: a requester who
loses item access can still withdraw, with null media. Item-scoped GET requires
item visibility and returns the full item summary, scoped history, and the ask
capability. DTO member and visible media lookups are batched.

The uploader/admin queue defaults to open, sorts IDs descending, and paginates
with an opaque ID cursor. Uploaders see only their snapshot uploader rows;
admins see all rows. Both tab counts share one scoped grouped query. Deleted
history remains in the queue even after the item foreign key becomes null.

Only requesters withdraw. Only snapshot uploaders or admins decline, with trimmed
nonempty own words. Permission checks precede the open-state conflict, and an
update conditioned on open prevents settling twice. The partial unique index
allows one open ask per member and item; settled history permits asking again.
Deleting an item is the resolution, with no accept route.

State changes and mail inserts share an immediate transaction. SQL insertion
failures roll back the state and every earlier message. Missing public base URL
instead records terminal failed mail and permits the requested state change.

| Event              | Active recipients               | Preference                          |
| ------------------ | ------------------------------- | ----------------------------------- |
| Requested/reminder | Snapshot uploader and admins    | Removal preference                  |
| Deleted            | Requester and snapshot uploader | Requester bypasses; uploader honors |
| Declined           | Requester                       | Bypasses removal preference         |
| Withdrawn          | Snapshot uploader and admins    | Removal preference                  |

All events exclude the actor and deduplicate identities. Provider suppression
still applies. Names, settings, copy inputs, dates, and links freeze at enqueue.
Deleted messages contain no item link. Legacy live rows with null capture
snapshot derive the email day from the item without rewriting history. Reminders
require a positive calendar-week index supplied by the job and use per-recipient,
per-week keys; resolutions share per-request/per-recipient keys.

Deletion settles every open request before the item foreign key becomes null,
without rewriting any settled resolver, timestamp, or outcome. Snapshot facts
and live legacy fallbacks are read before destruction. A late outbound insert
error rolls back all earlier messages, requests, object cleanup queues,
activity, and item destruction together; the transaction never calls B2.

The hourly reminder job reads open requests and current active recipients in
an immediate transaction. It excludes each requester's identity, including
requester-admins, deduplicates uploader-admins, and honors removal preferences.
Local calendar weeks in the Shoebox timezone start at index one. Blind
conflict-noop insertion preserves one message per recipient and week across
hourly retries; a new admin can receive the current week's reminder. Settling
by deletion, decline, or withdrawal stops future enqueues without changing
already queued messages. There is no last-reminded state or catch-up.

## Web answering and queue

`/removal-requests` reads separate open and settled pages keyed by the member.
Uploader/admin roles permit queue access; each DTO's `canDeleteItem`,
`canDecline`, and `canWithdraw` alone permit its controls. Server counts remain
visible even when only some cards are loaded, and settled history remains
available with no waiting requests. Empty advancing pages continue; repeated
cursors stop with retry guidance, and request IDs deduplicate cards.

Shared cards preserve requester, uploader, and actual resolver snapshots and
render reasons verbatim as wrapped plain text. A null item identity shows Gone;
a live identity with null media shows Unavailable. Neither has a photograph
image or link. The decline dialog links visible photographs to their existing
Who can see this section without settling the request.

The shared answer controller captures member, request, and item identities in
each mutation. Item deletion shares the existing item write scope; decline and
withdrawal share a request scope. An immediate guard covers the write and read
reconciliation. Dialog dismissal and target switching pause while submitting;
failed decline text survives cancellation/reopening for the same request.
Successful answers refresh both queue tabs and matching item history, while
item detail and archive reads become stale without counted item GETs. Deleting
an item refreshes every open request it settled. Mantine restores the opening
control on cancellation, or a surviving selected queue tab when refresh removed
that control.

A lost response or stale capability triggers authoritative request reads before
another deliberate attempt. Admins and snapshot uploaders use the queue; other
requesters use accessible item history. If independent queue reads straddle
settlement, the settled result takes precedence over an older open result. Queue reconciliation follows opaque pages until
it finds the request or reaches the end; a confirmed settled request cannot
be replayed. If a requester outside their queue
scope has lost item visibility, item history may be inaccessible and the queue
cannot include their request. There is no request-ID GET to
close this gap. The UI then leaves busy state, explains the uncertainty, and
blocks another write until an authorized read succeeds; it never treats a
404 as proof of deletion or automatically repeats a mutation.

## Web asking and own history

`/items/$itemId/removal` reads the member-scoped item history, item summary,
and `canRequestRemoval` before drawing controls. This read never counts an
item open. Missing, malformed, and inaccessible addresses share one unavailable
presentation and a way back to the pile. A supplied preview uses the Shoebox
timezone; no item-detail fetch is needed. A failed thumbnail shows Unavailable
and tries the image again when its signed URL changes.

Own open history takes precedence over a fresh form. Otherwise the newest own
request shows its original words and actual responder words, including declined
and withdrawn outcomes. Requester identity groups history; DTO capabilities
alone authorize withdrawal or answering. Incoming requests stay visible beside
own history and asking, including members who are both askers and uploaders or
admins. Ask again opens an empty optional form for that particular historical
request and sends nothing until Send is pressed.

The form retains failed words, trims the optional reason, and enforces the
4,000-character limit. Creation has an immediate duplicate-write guard and no
automatic retry. A lost response refreshes item history and discovers an own
open request before any later deliberate write. If the read fails, another
Send first attempts only an authority refresh. Confirmations say the request
was recorded and notifications queued, with no recipient count or delivery
promise.

Returned withdrawal/decline output can update the displayed history while
fresh asking still requires refreshed `canRequestRemoval`. Current read rows
replace confirmed open output, keeping capabilities, names, and signed media
URLs fresh. A confirmed settlement can supersede an older open row, while
settled authority from a newer read still wins. Failed background
reads retain confirmed rows and failed words while disabling fresh asking.
Member/item changes isolate rows, forms, and completion notices. A confirmed
delete navigates to the answer queue with a local confirmation rather than a
dead photograph; a delayed delete of a previous item cannot move the current
page. Shared dialogs restore focus to the asking page when their old control
has gone.

## Browser acceptance and thumbnail failure

Real browser and three-person manual flows verify optional reasons, withdrawal,
queued uploader notification, exact decline words, asking again and deletion
settling multiple asks. Permission assertions prohibit proxy withdrawal and
viewer answering/deletion. The decline dialog initially focuses its required
reply field, traps keyboard traversal, restores the trigger on Cancel and uses
a surviving queue tab after settlement. Ask again keeps a readable print ground
in both colour schemes.

A failed or expired queue thumbnail becomes Unavailable without implying Gone.
The live photograph link and DTO-granted actions remain available; the fallback
makes no extra item read. Deleted identity still renders Gone without an image
or dead link. Five asking and five queue states were compared in both schemes,
with long replies, failed controls, keyboard and actual native 200% zoom checks.
See [e2e.md](e2e.md) for the distinct live, controlled and manual evidence.

## Unavailable history and local dates

An unconfirmed withdrawal remains announced at page level when a subsequent
history read returns 403 or 404. The page leaves busy state and offers a
deliberate history-only retry, keeping media, request actions and dead photo
links absent while access is unavailable. The controller's replay block
survives these read attempts; unavailable history never proves deletion.

Request creation, capture and settlement instants in shared cards use the
configured Shoebox timezone and English-month date helpers, matching the asking
preview across a UTC/local-day boundary. Queue continuation and read-retry
controls use panel colors so they remain visible in both renditions.

## Client organization and regression coverage

The shared removal API helpers own paginated reads and DTO validation. Asking
and answering use one refusal classifier to decide when authoritative reads
must reconcile an unconfirmed result. Wire cursors remain nullable; the client
uses `undefined` for a completed pagination sequence.

Cards own their words and preview components, and each action dialog owns its
private contents. Surface and action-controller tests separate asking/history,
repeated requests, settlements, invalidation, recovery and mounted ownership.
Their controllable responses keep counters and state live across async actions.
