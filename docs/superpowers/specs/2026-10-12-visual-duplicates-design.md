# Visual duplicate detection

## Intended result

Picking photos checks for duplicates before Upload. Byte-identical files and
visually matching exports are automatically skipped and remain visible with
explicit duplicate/skipping copy. Filename is never photo identity. Originals
are uploaded and stored byte-for-byte; fingerprinting only reads them.

## Matching

Keep SHA-256 plus byte size as the exact-file identity. Add a versioned visual
fingerprint for photos: an oriented 32 by 32 sRGB image supplies a 64-bit DCT
perceptual hash, a spatial gradient signature, and a small color grid. Require
all comparisons plus aspect ratio to agree. Exclude featureless images from
automatic visual matching. Thresholds are conservative and must distinguish the
two adjacent real-world sample frames as well as match their resized exports.
This detects re-encoding and resizing, not arbitrary crops or substantive edits;
visual similarity remains a heuristic and cannot prove original-file identity.

Calculate fingerprints in the existing browser media worker during draft checks,
cache them with the manifest entry, and persist them on upload files and items.
Failure to decode leaves the photo eligible with exact-byte checks still active.
Videos retain exact-byte checks. Use indexed perceptual-hash bands to narrow
archive candidates before comparing signatures. Treat within-batch visual copies
as duplicates too, keeping the first eligible file. Return no archive item IDs,
names, dates or visibility details in duplicate feedback.

## Automatic data migration

Append migration 0015. It adds nullable fingerprint fields, candidate indexes and
a durable photo backfill queue seeded from existing photos. The ordinary
migration runner owns its transaction and backup. No network operation runs
inside a schema migration.

Register an automatic background data migration with the app lifecycle. Process
bounded batches sequentially, prefer stored thumbnails/display renditions, and
fall back to originals where necessary. Decode with sharp, normalize orientation
and sRGB, and use the shared fingerprint algorithm. Put network/decode work
outside SQLite transactions. Save successes independently, retry failures with
durable backoff, and resume after restarts. Check source identity before writing;
deletion or replacement during a download must not attach stale evidence.
Legacy clients or failed browser decodes enqueue missing fingerprints at ingest.
The app remains available during backfill, and matching expands as it progresses.
There are no production-specific IDs, filenames, keys or manual production edits.

## Validation and limits

Use red/green tests for matching, indexed candidate selection, draft cancellation,
same-batch copies, durable notices, schema upgrades and automatic resumable work.
Verify re-encoded JPEGs, orientation, distinct similar photos, low-information
images, unsupported/corrupt decodes, retries, restart and deletion races. Benchmark
the supplied images locally and report observed CPU time separately from network
time. Private photos remain temporary local verification artifacts, never fixtures
committed to the repository. No production uploads or emails during testing.
