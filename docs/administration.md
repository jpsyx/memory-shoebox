# Administration

The server currently provides two administrative reads: `GET /api/settings`
and `GET /api/mail/health`. Both require an active admin session. Anonymous
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
patches, first-run setup and the other administration routes are delivered by
later tasks in this implementation slice.
