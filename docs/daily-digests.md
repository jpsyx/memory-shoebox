# Activity email frequencies

Members choose **Off**, **Immediate**, or **Daily digest** for New photos/videos,
Comments and replies, and Comment tags. Uploads and comments default to Daily;
tags default to Immediate. Removal notifications retain their boolean preference
and existing weekly reminder. There is no weekly activity digest. Immediate
messages use the existing ten-second mail queue, so delivery is asynchronous.

## Daily delivery

The minute job prepares one combined email per recipient and local send date at
or after 9 a.m. in `shoebox.timezone`. It includes activity before that date's
local midnight, not a rolling 24-hour window. Today's activity waits. After an
outage, all overdue activity joins one catch-up digest labeled with its actual
date range. Empty days produce no message. Prepared batches retain their timezone
and date; timezone changes affect future preparation only.

The three sections omit empty categories. Each shows at most 20 source entries
and counts all eligible activity, including overflow. Comment excerpts contain
at most 200 Unicode codepoints. Links open authenticated application pages;
there are no attachments, signed media URLs, or hidden-item totals.

## Preferences and migration

`GET /api/me` and `PATCH /api/me` use `off | immediate | daily` for `onUpload`,
`onComment`, and `onCommentTag`, with `onRemoval` remaining boolean. `onComment`
covers both uploader and prior-participant relationships. Updates require the
complete four-field object. Obsolete `onReply`, legacy boolean frequencies, and
weekly values are rejected. Clients should reload after notification validation
errors. Bulk re-enabling restores Daily, Daily, Immediate, and removal enabled.

Migration `0022_daily_digests` sets these defaults once for **every existing
member**, including previous opt-outs, pending invitations, and removed members.
Later restarts preserve user edits. Inactive members never receive activity mail.
Legacy activity boolean columns remain inert; runtime uses the frequency columns.
The reset takes effect when the migration runs against a catalog. This code
change does not deploy or modify production users.

Never-attempted queued upload/comment emails become pending digest events and
their individual queue rows are cancelled. Tags, sending rows, attempted retries,
and terminal history retain their identities. Recent base-URL failures recover
through current preferences; attempted individual requests retain their payload.

## Event and batch lifecycle

Feature transactions select recipients as before, excluding self and inaccessible
items. `scheduleActivityNotification` either queues an individual email, records a
pending event, or does nothing. Enabled tags take precedence over generic comment
mail on creation. The permanent tag ledger prevents removal/re-addition from
sending another notification, including across frequency changes.

`notification_digest_events` stores source references, occurrence time, a unique
deduplication key, and pending/included/cancelled state. Source deletion does not
erase history. Switching a category away from Daily cancels its pending events
inside the preference-save transaction. Turning it back on cannot resurrect them.
Comment/thread deletion and tag removal also cancel affected pending events.

`notification_digest_batches` is unique on member and local send date. Each member
has one immediate SQLite transaction for preparation: recheck due state and current
access, cancel invalid sources, reserve the batch, enqueue its message, and mark
all eligible events included. Failures roll everything back. Recipients are read
in pages of 50 and pending references in pages of 500. Preparation retains source
manifests and capped excerpts in memory; extreme backlogs therefore require memory
proportional to the number of sources. No provider call runs in this transaction.

## Delivery and retries

The existing outbox handles suppression, configuration deferral, rate limiting,
provider failures, and delivery history. Before first handoff, the digest rechecks
active membership, category not Off, surviving sources, current tags, and item
visibility. It rebuilds from surviving activity or cancels an empty result. A
render-time eligibility change defers for ten seconds without consuming an attempt.
Daily-to-Immediate does not revoke an already included batch; Off does.

Immediately before provider handoff, the batch freezes its exact HTML, text,
subject, recipient, sender, idempotency key, and contributing source/item manifest.
Retries perform their final eligibility check in an immediate transaction and
reuse that request. Ordinary text or sender-setting edits cannot change
it. If any contributing content, including overflow counts, becomes inaccessible,
deleted, untagged, or opted out, the retry is cancelled instead of rewritten.
A provider-accepted email cannot be recalled. The existing stranded-`sending`
policy remains unchanged.

Missing base URL produces a configuration-failed outbox row retaining the batch.
Recovery rebuilds safe links on that same row; it never creates a second batch.
An internal placeholder origin on this failure path cannot reach the provider.

All verification uses local catalogs and recording/fake email services. See
[mail](mail.md), [email templates](emails.md), and [migrations](migrations.md).
