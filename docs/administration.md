# Administration

The server provides settings reads and writes, mail health reads, role-selected member
directories, member authority changes, invitation lifecycle actions and invitation
name suggestions, group administration, confirmed access rewrites, presence, item viewers and the
historical activity feed. Administrative
operations require an active admin session. Anonymous
requests receive `401 not_signed_in`; uploaders and viewers receive
`403 settings_forbidden` or `403 mail_forbidden`. The Members web surface uses these routes; other admin surfaces are
implemented separately in Step 9.

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

## Settings writes and timezone previews

`PATCH /api/settings` accepts only the six editable keys in the shared registry,
in strict nested objects. `preview=true` is a query parameter, never a body
field. Internal mail-domain, visibility and setup keys return
`settings_not_writable`; unknown keys and invalid registry values return
`invalid_request`. Authorization runs before validation.

Saves read current values and recompute their effects under `BEGIN IMMEDIATE`.
All changed settings, their provenance, and one `setting_changed` activity row
per changed key commit together. Activity details contain `fromValue` and
`toValue`; equal resolved values write nothing and do not change attribution.
Settings do not bump the visibility generation. Previews use the same impact
calculation without any writes and return current settings alongside the impact.
A catalog change after preview is reflected in the save's recomputed response.
Timezone writes use bounded batches within that one transaction, so large
catalogs do not exceed SQLite's bound-parameter limit; preview joins avoid
unbounded item-ID lists.

`previewTimezoneChange` considers only items without a stored capture offset.
It reports local-day moves, burst ejections and out-of-span milestone counts.
`applyTimezoneChange` writes each moved item's `captured_on` and one
`item_capture_date_changes` row with reason `timezone_change`, both local days,
the unchanged instant and original source. It preserves `captured_at`, offsets,
`capture_source`, `original_captured_at` and upload-file evidence. The existing
burst helper ejects frames leaving their burst's day and deletes only empty
bursts; milestone acknowledgements clear only for moved items now outside a
span. An individual day can be reverted through the existing
`POST /api/items/:itemId/capture-date` endpoint with the history row's previous
date, following its ordinary manual-correction behavior.

Changing the sender's domain clears obsolete mail verification and check-error
facts in the same transaction; changing only its local part retains them.
Changing `public.base_url` repairs eligible retained failed messages as described
in [mail.md](mail.md). Neither operation calls a provider.

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
patches and first-run setup are implemented in this slice;
[setup.md](setup.md) describes its atomic bootstrap and browser flow.

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

## Groups and confirmed deletion

`GET /api/groups` returns full administrative rows to admins, picker references
(name and ID only) to uploaders, and refuses viewers. Group list reads use three
batch queries: identities, memberships, and item counts grouped by mode. Counts
are items, with `only` and `except` kept separate; zero-item referenced rules
still require confirmation before deletion.

Group writes normalize names with the existing tag normalization, deduplicate
member IDs, accept active and invited identities, and reject removed or unknown
members. Creation bumps visibility generation only with initial members;
renaming writes historical names without a bump. Membership replacement records
labeled additions and removals and always bumps generation, even for a no-op.
Each write and its audit event commit under the immediate writer lock.

Usage expands all remaining rule subjects and group memberships in sets. The
access delta lists exclude admins, removed identities, members still named by
another subject, and members who uploaded every affected item. Item counts
retain their rule-based directional meaning. Empty allow lists remain visible
to admins and each item's uploader.

The ten-minute confirmation token signs a canonical snapshot containing group
identity, sorted rule subjects and modes, expanded memberships, member roles
and statuses, and each affected item ID, rule assignment and uploader. A
separate HKDF-derived HMAC key comes from the session secret. Signature checks
use constant-time comparison. Membership, role, subject or item changes can
invalidate consent even when all reported totals stay the same.

Deletion recomputes that snapshot inside `BEGIN IMMEDIATE`. Missing consent or
changed usage returns a conflict with the full fresh usage response, including
a replacement token. Successful deletion removes the group's subjects,
recomputes the existing canonical digests without merging equivalent rules,
retains empty `only` rules and all item IDs, deletes the group, bumps generation,
and writes one historical event including the members who gained access. No
email or media-provider operation runs in these transactions. Existing cookies
observe membership changes and confirmed widening on their next request.

## Presence and item viewers

`GET /api/presence` returns all active and invited members to admins and the
caller's own complete record to other roles. A non-admin requesting somebody
else's ID receives `403 presence_forbidden`. Removed members are omitted;
an admin targeting an existing removed identity receives an empty collection,
while an unknown identity returns `404 member_not_found`.
Counts describe live opened items, comments and both reaction tables, so hard
deletions lower them. A self read retains the member's own history across
access changes rather than applying their current item visibility.

An active day contains at least one durable first-seen, first-opened,
last-opened, comment or reaction mark during the ninety local calendar days
ending today. The observation-specific
`getPresenceLocalDayIntervalsFromWindow` splits the window at offset changes and
local midnights, producing disjoint UTC intervals labeled with their local date.
The grouped SQL union counts distinct labels, so a date that occurs in separate
intervals counts once, and a clock retreat into a date outside the window adds
nothing. Midnight gaps and repeated midnights follow the actual local date;
capture-time disambiguation stays unchanged. Offset discovery uses six-hour
probes followed by exact transition bisection. It assumes an offset does not
change and reverse within one probe interval; such a short-lived offset regime
could be missed. This is not an exhaustive proof of timezone history.
The server returns grouped member counts rather than individual marks.
Presence uses four fixed reads: members, timezone, grouped active days and
grouped live counts. Sorting uses active days, opened items, comments,
last sign-in with nulls last, then display name. The read records no analytics.

`GET /api/items/:itemId/viewers` first uses the normal visible-item guard.
Invisible and missing IDs return byte-identical `404 item_not_found`; only
then can a visible item return `403 presence_forbidden` to a lower role.
Admins receive currently eligible members including unseen invitees, and
removed members only when they opened the item. Eligibility expands named
members and current group membership in one batched query, applying the same
admin, uploader and everyone/only/except evaluation as normal item reads.
People tags supply no eligibility. The four fixed reads include the guard,
rule mode, expanded subject set, and members left-joined to views.
Ordering puts opened rows first by open count and latest opening, followed by
seen-only rows by first sight, then unseen rows by name. Neither route writes
views, creates presence tables, sends mail or accesses media providers.

## Historical activity

`getActivityDetailFromEvent.ts` selects public detail from stored events;
`getActivityFamilyFromKind.ts` maps supported event kinds to their families.

`GET /api/activity` is admin-only and reads only `activity_events`. It uses
`(occurred_at DESC, id DESC)` ordering, a validated opaque cursor and one extra
row to determine the next cursor. Exact actor, subject and family filters
combine; the default limit is fifty and the cap is two hundred.
A distinct-kind read validates the entire stored vocabulary before family
filters and pagination, so corrupt kinds fail loudly even off the page.
The family map covers all twenty migration kinds with no fallback.

Actor, subject and device labels come directly from historical event columns;
renames, deleted sessions and dangling subjects cannot replace them. Detail
parsing exposes only the four contracted variants. Group member deltas become
historical label arrays, setting values become nullable strings, and setting
keys remain their historical subject IDs. Setting IDs and exact subject
filters accept bounded nonempty strings up to 256 characters; other subject
kinds retain UUID validation. Today's setting registry never invalidates an
old key. Visibility events written with only rule IDs return null labels
rather than looking up present-day names. Events without a detail variant
return null without parsing their unused storage payload.

## Module ownership

Group readers, mutations and usage helpers live in the administration helper
collections `groupReadHelpers.ts`, `groupMutationHelpers.ts` and
`groupUsageHelpers.ts`. Their routes retain separate permission and transaction
boundaries. Internal optional values use `undefined`; persistence and HTTP
responses convert absence to their existing nullable contracts. Clearing a
setting remains distinct from omitting it in a partial request.

Large route suites are grouped by resource, with shared fixture and assertion
helpers inside `__tests__/`. The configured mail-health app is shared across
route suites through `test/helpers/createConfiguredMailHealthApp.ts`. This separates creation, reads, mutations,
concurrency and failure scenarios while preserving the catalog assertions and
sequential writes that verify authority and history.

## Members in the web app

`/members` is an admin-only directory with a back link to My account, a Groups
link and actor-filtered Changes links. Other roles see an access explanation
and issue no privileged member read. The full directory and stripped visibility
picker retain separate query keys. Failed reads offer Retry. Desktop tables
become labeled rows on narrow screens, including the signed-in device list.

The inline invite form normalizes addresses, suggests archive names after a
short debounce and lets the administrator replace the suggestion permanently
for that draft. The invitation is queued, rather than reported as delivered.
Pending and expired invitations can be resent or explicitly revoked. Persisted
server throttling displays its retry wait and disables repeat sends.

Role, removal, invitation revocation and device revocation use focus-trapped
confirmations. Keyboard focus returns to the opening control after cancellation
or a successful action when that control remains; otherwise it returns to the
member directory. Local validation marks the failing invitation field while
retaining the draft. Last-active-admin demotion and removal are disabled before a
request; invited admins never count. A concurrent `members_last_admin` refusal
keeps the chosen role and confirmation open and refreshes the directory.
Removal copy explains that uploads, comments and person tags survive. Device
revocation includes other members' devices and the administrator's own current
device. Current-device revocation and self-removal clear private caches and
return to sign-in. Role changes refresh account and route authority, including
self-demotion. Writes invalidate directory, group, archive, observation, removal
and milestone reads; field and mutation errors retain the draft and pending
controls prevent duplicate confirmation.

## Groups in the web app

`/groups` is an active-admin surface with its own account back link. Other roles
receive an access explanation without privileged group or directory reads.
The admin and visibility-picker caches are separate. List and usage failures
retain their causes and offer Retry; desktop group rows become labeled rows on
small screens. The inline creation form and edit dialog reuse the member picker,
including invited identities and excluding removed members.

A rename and membership replacement are separate writes. A successful rename is
applied immediately and remains visible if membership replacement fails. The
retained draft retries the remaining membership write without repeating the
committed rename. Validation stays on the failing field, pending controls prevent
duplicate saves, and dialogs retain protected focus until the write completes.
Focus returns to the original action or the directory when its row disappears.

Deletion always reads fresh usage first, then displays both directional item
counts, names losing or gaining access, and the empty Only-list protection for
admins and each item's uploader. A failed usage read disables confirmation. The
opaque consent token travels only in the DELETE query. A missing or stale consent
conflict validates and replaces the displayed usage, even when totals are
unchanged, and requires another explicit click. Malformed or unrelated fresh
usage cannot authorize deletion.

Execution checks current cached authority before each write, including between
rename and membership replacement. Privileged read refusals refresh account and
route authority. Completed writes refresh admin and picker groups, members,
items, timeline, bursts, presence, activity, observations and the account before
continuing. A persisted write remains successful when account reconciliation
fails: the form or dialog explains that the group was created, saved or deleted,
keeps further group actions disabled, and offers Retry account refresh. That
recovery repeats only reads and route authority reconciliation, never the
completed POST, PATCH, PUT or DELETE.
