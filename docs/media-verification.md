# Verify media loading after deployment

Run these checks against the deployed app in Chrome and on a physical iPhone
using Safari. Allow about 20 minutes, plus the optional idle-tab check. Commands
run from the main repository checkout and use its existing operator credentials.
The app name below is the configured deployment, `sunmiento-shoebox`.

The local production environment file inspected on October 16, 2026 has
`MEDIA_PROCESSING_ENABLED=false`. That does not prove the live value. Step 1
checks it. Disabled processing leaves caching, prefetching, exact duplicate
checks, and matching against existing photo fingerprints active. Automatic
optimization and missing-fingerprint backfill remain queued.

Use existing archived media and uncommitted upload drafts for these checks.
Discard the drafts afterward. No test upload needs to be published to the family.
All SQL below opens the production catalog read-only.

## 1. Confirm health and the deployed processing setting

```sh
curl --fail https://sunmiento-shoebox.fly.dev/api/health

fly ssh console --app sunmiento-shoebox --command \
  'printenv MEDIA_PROCESSING_ENABLED MEDIA_PROCESSING_CGROUP_ROOT MEDIA_PROCESSING_SCRATCH_ROOT'

fly logs --app sunmiento-shoebox --no-tail
```

Expect HTTP 200 with `status: "ok"`. The environment command prints the enabled
flag, cgroup root, and scratch root in that order. It does not print credentials.
The `fly` commands require the operator's existing Fly CLI login; `prod:sql`
separately reads its credentials from `.env.deploy`.

If disabled, `automatic media processing disabled` with reason
`processing_disabled` is expected. If enabled, that message with another reason,
such as `processing_isolation_unavailable`, means automatic work cannot run.
Report the reason. Health returning 200 alone does not verify background work.
The diagnostic is logged when the reason changes, so its absence from the recent
log buffer is not proof of success. Check actual job progress in step 8.

## 2. Check duplicate-detection coverage in the existing catalog

```sh
pnpm prod:sql --readonly "
SELECT kind, COUNT(*) AS items,
       SUM(checksum IS NOT NULL) AS with_checksum,
       SUM(visual_fingerprint IS NOT NULL) AS with_fingerprint
FROM items GROUP BY kind;
SELECT COUNT(*) AS fingerprints_queued FROM photo_fingerprint_backfill;
SELECT last_error, COUNT(*) AS queued
FROM photo_fingerprint_backfill GROUP BY last_error;"
```

Photos need a stored fingerprint to match a differently encoded upload visually.
An old photo without one cannot pass that particular check yet. Videos currently
support exact-byte duplicates only. A re-encoded video is not detected visually.
Missing legacy checksums also limit exact matching against those archived items.
Do not interpret an empty fingerprint queue as full coverage: featureless photos
intentionally have no fingerprint, and failed decodes can remain queued.

For a deterministic archive test, list a few eligible photo IDs:

```sh
pnpm prod:sql --readonly "
SELECT id FROM items
WHERE kind = 'photo' AND checksum IS NOT NULL
  AND visual_fingerprint IS NOT NULL
ORDER BY id DESC LIMIT 5;"
```

Open `https://sunmiento-shoebox.fly.dev/items/ITEM_ID`, replacing `ITEM_ID` with
one returned ID. Pick a detailed photo, not a blank image. Use **Download the
original** in its details/actions. Keep that file for step 3.

## 3. Verify both exact and visual photo duplicates before Upload

In macOS Preview, open a copy of the downloaded photo, resize it to roughly half
its width while preserving aspect ratio, and export it as a JPEG at a different
quality with a different filename. Keep the original untouched. Do not crop,
recolor, or otherwise edit the composition. Compare their SHA-256 hashes:

```sh
shasum -a 256 '/path/to/original.jpg' '/path/to/renamed-export.jpg'
```

The hashes must differ. Use actual file paths, which can be dragged into Terminal.
Then try these draft selections and wait for duplicate checking to finish:

| Selection                                                     | Expected result                                                            |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Downloaded original alone                                     | Skipped with the already-in-the-shoebox notice.                            |
| Renamed, resized JPEG alone in a separate draft               | Also skipped, despite its different hash. This is the fingerprint check.   |
| An unarchived photo and its resized export together           | One remains eligible; the other is skipped as already selected.            |
| Two genuinely different photos, including nearby burst frames | Both remain eligible. Matching filenames alone must not cause a duplicate. |

Test the resized archived photo by itself so a duplicate of another selected
file cannot disguise a failed archive match. Use separate drafts or clear all
previous picks between cases. If a photo without a known fingerprint misses,
record that separately from a failure on the eligible photo chosen in step 2.
Discard every test draft without publishing.

## 4. Verify ordinary refresh uses the browser media cache

In Chrome DevTools, open Network, leave **Disable cache unchecked**, select **No
throttling**, and show the Size/Transferred columns. Load a timeline section and
one photo completely. Clear only the request list, then use ordinary reload
with Command-R. Do not use hard reload or clear browser storage.

Expect the same media URLs to use memory/disk cache with no new media body
transfer on the warm reload. Fresh API/authorization requests are normal.
An image request row, or a displayed 200 status, does not by itself mean bytes
were downloaded again. Inspect transferred bytes and the cache indication.
On a network-served B2 image, inspect its response header for
`Cache-Control: private, max-age=604800`.

Repeat once more on the same images. If full media bodies transfer every time,
record their sizes, whether the URLs changed, and the cache headers. The first
visit after deployment, a new rendition, browser cache eviction, or lease renewal
can legitimately transfer again. Viewing URLs are reused for about an hour
within a server process; the browser freshness policy is seven days for the
same immutable URL. A deploy does not preserve the server's signing cache.

## 5. Verify next/previous loading and timeline behavior

On a normal connection, open a photo and wait until it is sharp, then pause for
about one second. Advance twice, go back once, and repeat in the other direction.
Expect nearby photos to appear promptly with the correct image and orientation.
The intended window is two items ahead and one behind, subject to source sizes,
byte budgets, connection policy, and already-cached media.

Network should show bounded neighbor previews, not the entire album downloading.
Neighbor videos warm their poster/thumbnail, not the full video. Opening a video
can still require a playback request. Current media loads before speculative
neighbors; rapid clicks do not guarantee every destination was prefetched.

Expand and collapse a burst, scroll several screens, open a photo, then go back.
Expect a stable reading position, no missing rows, and no wrong/stale image flash.
On 3G the policy narrows; Save-Data, 2G, and a hidden tab suppress speculation.
Native transfers already started can finish after leaving a view.

## 6. Verify playback on desktop and a physical iPhone

Play an existing landscape video and portrait video. Check poster-to-video
transition, orientation, audio, seeking well ahead, pause/resume, next/previous,
and returning from the background. Repeat on iPhone Safari. If available, also
try a camera HEVC/HDR clip and report its format if it fails.

Expect playable media to start without waiting for a complete original download.
A network byte-range response, when requested, should use 206 and a valid
`Content-Range`; cache hits may avoid a new request. Seeking must not fail with
403/416 or restart the whole download repeatedly. Optimized MP4s are selected
when available. Original-only format support still depends on the browser;
enabling processing does not guarantee every unsupported codec becomes playable.

Also select an exact copy of an archived video with a stored checksum in an
upload draft: it should be skipped. Discard the draft. A transcoded video is
outside current visual matching support.

## 7. Verify originals remain intact

For one photo and one video whose pre-upload originals are still on the computer,
download their originals from the app. Compare each downloaded file with its
corresponding local original using `shasum -a 256` as in step 3.

Expect equal hashes within each pair. A viewing rendition is intentionally
different; choose **Download the original**, not Save Image from the viewer.
If no pre-upload file is available, mark this check unavailable rather than
comparing two downloads of the same stored file.

## 8. Verify background progress if processing is enabled

Skip this step when the live flag is false, and record optimization/backfill as
disabled. When true, keep the app active and run this query twice, a few minutes
apart, while existing eligible work is queued:

```sh
pnpm prod:sql --readonly "
SELECT recipe, state, error_code, COUNT(*) AS jobs
FROM media_processing_jobs GROUP BY recipe, state, error_code;
SELECT purpose, COUNT(*) AS renditions
FROM item_renditions GROUP BY purpose;
SELECT COUNT(*) AS fingerprints_queued FROM photo_fingerprint_backfill;
SELECT COUNT(*) AS fingerprinted_photos FROM items
WHERE kind = 'photo' AND visual_fingerprint IS NOT NULL;
SELECT recipe, state, error_code, updated_at
FROM media_processing_jobs ORDER BY updated_at DESC LIMIT 10;"
```

Expect eligible jobs to complete and the required viewing renditions to appear:
photos have `thumb`, `display_small`, and `display`; videos have `thumb`, `poster`,
and `video_mp4`. Existing browser-produced renditions alone do not prove the
server worker ran. Confirm newly completed jobs and their timestamps. Reopen a
completed item and check it actually displays or plays its optimized source.

Watch `photo fingerprint backfill progress` logs, including retries. A shrinking
queue without new fingerprints can mean featureless inputs. Completion time
varies; no eligible work makes the check inconclusive.

If jobs remain queued, become unavailable, or repeatedly retry, report the
counts and safe error codes. Do not force processing by changing production
database rows or weakening runtime checks. Hard cgroup enforcement and memory
pressure still need separate staging validation; these smoke checks do not prove
the full 512 MiB containment envelope.

## 9. Optional idle-tab check and results to return

Leave a photo/video tab open or backgrounded for over an hour, then return,
navigate, and play/seek. Expect renewed authorized sources without a stuck expired
URL or repeated 403 loop. This is lease recovery, not a promise of offline access.

Return the deployed flag, catalog coverage counts, pass/fail for steps 3-7,
worker progress/error codes when enabled, and browser/device details for failures.
For cache failures, include transferred bytes and whether the URL changed.
Signed media URLs and complete HAR files are unnecessary.

See [visual duplicate detection](visual-duplicates.md) for scope and regression
coverage, and [media loading](media-loading.md) for caching and prefetch limits.
