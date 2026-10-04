# Administration

The server provides settings and mail health reads, role-selected member
directories, member authority changes, invitation lifecycle actions and invitation
name suggestions. Administrative
operations require an active admin session. Anonymous
requests receive `401 not_signed_in`; uploaders and viewers receive
`403 settings_forbidden` or `403 mail_forbidden`. The existing web placeholders
remain unchanged.

## Settings reads and persistence

`readAdminSettings` reads the six editable instance keys through the shared
registry. A catalog with zero settings rows returns defaults and lists all six
in `defaultedKeys`, without writing any rows. Stored rows carry their update
instant and a joined member reference; deleted provenance becomes null.
Internal setup, visibility and mail-domain settings are excluded.

Storage figures are computed from indexed media in the catalog, as one count
and byte-size sum over items. An empty sum becomes zero. These admin-only
figures describe original indexed media rather than bucket renditions or
orphans; the read makes no storage-provider call or timezone-impact scan.

`saveInstanceSetting` upserts an instance override against the existing partial
unique index on the key where scope is instance. It retains the row identity,
updates provenance, and accepts the caller's transaction. Authority writers
own validation, audit and the immediate transaction, so the persistence helper
adds neither an independent commit nor an activity event.

## Mail health

The health read selects one actionable diagnosis in configuration order and
combines it with existing queue aggregates, the latest failed record or queued
retry error, and active suppression count. Current terminal provider-refusal
diagnoses use a 24-hour horizon; queued retry errors remain current, and
internal worker failures do not accuse the provider. Historical failures and
queue totals remain unrestricted. Domain verification is a read-only
provider fact behind an injectable reader; an administrative value cannot
claim success. Provider calls happen outside a write transaction, and their
results are discarded when the sender domain changed while the read was in
flight. Fake or disabled mail reports real verification as unavailable and
leaves provider facts untouched.

Error strings from the persisted queue and domain facts never cross the
response boundary verbatim. The server uses safe summaries and a conservative
identifier allowlist, including for historical rendering failures whose raw
exception might contain a scrubbed sign-in code. This does not rewrite stored
queue history, change temporal diagnosis rules, or alter mail delivery.

See [mail.md](mail.md) for caching, safe provider errors, domain-fact
persistence, queue timestamp limitations, and failure precedence. Settings
patches, first-run setup and group actions are delivered by
later tasks in this implementation slice.

## Member directories and invitations

`GET /api/members` selects its shape from the session role. Admins receive
addresses, authority, history, the latest invitation and unexpired devices;
other members receive only names and IDs. Both default to invited and active
members. Repeatable `status` filters are admin-only, and unknown filters fail
validation. The admin read uses three batch queries even as membership grows.
Its active-admin count includes the full catalog regardless of status filters.
Invited admins never count toward the last-active-admin flag.

`POST /api/members` normalizes the address and validates the offered role and
optional name. Existing active or invited identities return a conflict with
their member ID. Removed identities reuse their row, preserving join/sign-in
history, content ownership, person links and other historical associations.
An omitted name preserves the old name; a supplied null clears it.

The immediate transaction writes the invited identity, a seven-day invitation,
`member_invited` audit event and outbound email together. Database enqueue
failures roll everything back, while missing mail configuration follows the
existing queue behavior. No provider call occurs in this transaction. The
queue key is `invite:<invitationId>:1`. Invitation copy and recipient metadata
freeze when queued; sender address/name are read by the worker at delivery.
Prospective item counts expand the invitee's own role and groups through the
shared visibility predicate, including their own uploads. First successful
code sign-in accepts the invitation through the existing authentication path.

`GET /api/member-suggestions` is admin-only. It strips an email plus suffix,
splits local-part tokens on separators and digits, and matches whole words
using the canonical Unicode/NFC name normalization. Because people have no
normalized-name column, a directory read finds matching IDs before SQL counts
their person tags and returns at most five in descending count order. No
match returns an empty list, and no media-provider call is needed.

## Member authority and lifecycle

Role changes and removal run under `BEGIN IMMEDIATE`, then recount all active
admins before commit. An invited admin never counts. An admin may demote or
remove themselves when another active admin remains; the last-admin conflict
rolls back the entire mutation. Removed identities cannot change role until
re-invited, and double removal returns a conflict.

Removal retains the member row, historical timestamps, uploads, comments,
person links and named visibility subjects. It deletes every session and group
membership and revokes all unspent invitations. The one `member_removed` audit
row snapshots group names and the number of revoked sessions. Actor and device
labels are read before device deletion, so self-removal retains attribution.
Role changes write `member_role_changed` with `fromRole` and `toRole`. Each
operation bumps visibility generation in its transaction.

Resending updates the latest unspent invitation in place, increments its send
count and restarts seven days from the server clock. It queues a distinct
`invite:<invitationId>:<sendCount>` email atomically, using the invitation's
original inviter. Existing persisted middleware enforces one send per minute
and ten per rolling day; the same checks run under the writer lock to prevent
concurrent resends exceeding those limits. Authorization runs before this
middleware, preserving `401` and `403` refusals for unauthorized requests.
Resend adds neither an audit row nor a visibility bump. It may renew an expired
invitation while its member is still invited, before the lapse job runs.

Revocation requires an invited member with a latest unspent invitation. It
removes devices and memberships, closes unspent invitations and bumps visibility
in the same transaction, recording one `invitation_revoked` event with the
status change. A separate removal event is not written.

Administrative device revocation deletes only the matching member/session pair,
returns an empty `204`, and records `device_revoked`. Missing and mismatched
sessions have identical errors. The deleted device label survives in audit;
the session foreign key becomes null while the subject ID remains historical.
Revoking the admin's own device works the same way. Sessions are checked on
every request, so the next request from any revoked cookie receives `401`.

The lapse job chooses the latest invitation across all history, then requires
it to be unaccepted, unrevoked and expired before removing invited authority.
A newer accepted or revoked invitation cannot be overridden by an older pending
row. Status, device and membership cleanup and a batch visibility bump commit
atomically. Empty or repeated runs do not bump generation. Expiry has no second
authentication gate: member status remains the authority for code redemption.
