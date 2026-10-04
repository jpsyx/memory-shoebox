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
