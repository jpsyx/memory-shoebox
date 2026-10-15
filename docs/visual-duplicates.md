# Visual duplicate detection

The upload draft skips copies of an existing photo, including resized or
re-encoded exports, and keeps the skipped files visible with duplicate notices.
A filename does not establish photo identity. Originals are transferred and
stored byte for byte; fingerprints are small derived metadata, not replacement
images. Videos continue using exact-byte duplicate checks.

## Photo evidence

Browser decoding applies orientation, normalizes sRGB, and samples a 32 by 32
image. A shared versioned fingerprint combines a perceptual hash, spatial
gradients, and color evidence. The server narrows archive candidates through four
indexed hash bands before applying conservative comparisons and aspect-ratio
checks. Different frames in a burst should remain separate. This is a heuristic
for alternate exports of the same photo, not proof of original-file identity;
crops and substantive edits are outside its intended coverage.

Version 1 uses at most two differing bits in the 64-bit DCT hash, at most 24
in the 240-bit gradient signature, RGB root-mean-square difference at most four
on a 0–255 scale, and aspect ratios within one percent. All checks must pass.
The saved text is 465 bytes per photo, plus database/index overhead. Fingerprints
are computed once per browser selection and reused across draft retries and
ingest; selecting that file again necessarily checks it again. The SHA-256 path
still streams the complete original, and later derivative generation has its
own decode.

A local five-run median on the debugging samples was 4.2–4.5 ms for the stored
256–262 KB JPEGs and 35.5 ms for a 4.4 MB, 24-megapixel export. These are local
decode-plus-fingerprint measurements, not production benchmarks, and exclude
network time. Backfill reads each successful photo once; B2 download volume and
requests depend on the existing rendition sizes. No external image-analysis
service is involved.

Featureless images provide too little evidence for automatic visual matching.
Failed or unsupported browser decodes leave the file eligible for upload, with
exact-byte matching still active. A browser selection ID makes draft retries
idempotent while allowing separate duplicate selections to retain their own
notices. It identifies a pick, never a photograph. Clients without these optional
fields remain supported.

## Automatic upgrades

Migration `0015_visual_duplicates` adds nullable evidence to `items` and
`upload_files`, installs lookup indexes, and seeds `photo_fingerprint_backfill`
from existing photos. Normal startup migrations and their backup mechanism own
this schema change. The migration downloads no media and preserves every
existing item and object. No production SQL edits or separate backfill command
are required for visual matching.

The app schedules `photo-fingerprint-backfill` automatically, beginning 30 seconds
after startup, but performs no read or decode unless automatic media processing
is enabled and mandatory OS isolation/capabilities are available. Disabled work
stays queued untouched. Capability checks, fingerprints and photo/video repair
share one decode coordinator. Each run processes at most five photos sequentially and stops
starting photos after 20 seconds. It tries a stored thumbnail, then a display
rendition, then the original if a smaller representation is missing, unavailable,
or undecodable. One successful representation is enough. Network and decode
work happen outside SQLite transactions, and each result commits independently.
When all reads are fast, the default schedule processes up to 600 photos per
hour; a large archive can take hours to complete. Existing photographs become
eligible for visual duplicate detection as this
queue progresses; startup and ordinary requests do not wait for the archive.

Photo ingest copies browser evidence when supplied. A legacy client or a browser
that could not produce evidence queues that new photo in the same ingest
transaction. Videos are not queued. Featureless server decodes remove the queue
entry without inventing a fingerprint or retrying forever.

## Bounds and recovery

Downloads require a complete response matching the catalog byte size. Compressed
HTTP responses and redirects are rejected. Each source is capped at 20 MiB and
its download has a 10-second deadline. Automatic decoding runs in a separate
Sharp child under the media runner's mandatory job memory/CPU controls,
concurrency 1 and disabled cache. It admits the configured 24 million pixels
and retains the five-second timeout. Browser-supplied fingerprints and the
thumb/display/original preference and failure semantics are unchanged. These bounds can leave
a legacy original above 24 MP unmatched until a usable smaller rendition exists.
Stored originals are never rewritten to satisfy the limits.

Failures stay in the durable queue with a safe error code and exponential
backoff, starting at one minute and capped at one day. Restarting resumes queued
work automatically. Progress logs report attempted, completed, retry, and
remaining counts without filenames, storage keys, private image contents, or
signed URLs. Corrupt or unavailable sources retry under the same backoff; they
do not block later due photos.

Before writing evidence, a short transaction compares the item and all relevant
rendition identities with the snapshot taken before downloading, including the
original even when a thumbnail supplied the pixels. A deletion cascades out of
the queue. A replacement leaves the entry available to retry from its current
source. Shutdown aborts active downloads before draining the job runner;
interrupted photos retain their queue entries without consuming retry attempts.
There is no in-process decoder fallback. The current local host has not proven
the cgroup/512 MiB deployment envelope, so automatic processing stays disabled;
local direct child adapters demonstrate codec behavior only.

The historical checksum backfill remains a separate operator tool, primarily
useful for original-byte identity and legacy videos. Visual backfill does not
need those checksums to run. See [catalog upgrades](migrations.md) and
[checksum maintenance](checksum-backfill.md).
