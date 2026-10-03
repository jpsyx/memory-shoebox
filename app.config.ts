/**
 * Product configuration for a Memory Shoebox deployment.
 *
 * These are product decisions rather than deployment secrets: they are the
 * same on every instance unless an operator deliberately changes one, and they
 * belong in version control where a change is reviewable and has a reason
 * attached. Anything that varies per machine, or that must never be committed,
 * is an environment variable instead. See `docs/configuration.md`.
 *
 * The server imports this with a relative path and a `.ts` extension, because
 * Node strips types at load time and resolves the import literally.
 */
export const appConfig = {
  burst: {
    /**
     * The largest gap, in seconds, between two consecutive frames that still
     * counts as the same burst.
     *
     * Why 10, because the number on its own says nothing. Detection has one
     * signal and only one: capture time within a single upload. Nothing
     * compares the images, so this number alone decides what "a run of
     * near-identical frames" means, and it is set by what it has to catch at
     * the loose end and what it has to refuse at the tight end.
     *
     * - It has to hold together the run the product was designed around: 45
     *   frames of one birthday candle between 06:41 and 06:44, which averages
     *   one every 4 seconds. Gaps inside a real run are uneven, so holding a
     *   4-second average together needs roughly double that as headroom. A
     *   3-second threshold would break that single stack into several.
     * - It has to catch the ordinary human version of a burst, "one more, she
     *   blinked", which lands somewhere between 3 and 8 seconds apart.
     * - It has to refuse a whole event. At 30 seconds a morning of casual
     *   shooting collapses into a handful of stacks, and genuinely different
     *   photographs end up hidden behind a cover somebody has to fan open to
     *   find.
     *
     * Lowering it makes the pile longer and more literal. Raising it makes the
     * pile shorter and starts grouping photographs that are not alike, which
     * is the failure that matters, because a hidden photograph is worse than a
     * repeated one.
     *
     * Changing it later is safe by design: the threshold that produced each
     * burst is stored on the burst row (`bursts.threshold_seconds`), alongside
     * `bursts.detector_version`, so a new value can re-derive the automatic
     * groupings without disturbing anybody's manual one.
     */
    maxGapSeconds: 10,

    /**
     * The fewest frames that can form a burst.
     *
     * Two photographs taken 6 seconds apart are two photographs. Collapsing
     * them saves the day no room and costs the viewer a fan-open to see what
     * is there, so a stack only earns its place from three frames up. A run of
     * two is left as two plain prints, and `data-models.md` already requires
     * the same of a burst that has decayed to one visible frame.
     */
    minimumFrameCount: 3,

    /**
     * Recorded on every automatic `bursts` row as `detector_version`.
     *
     * So a better algorithm can re-derive the automatic groupings later
     * without touching anybody's manual one. Bump it whenever
     * `detectBursts` changes what it groups.
     */
    detectorVersion: 1,
  },

  timeline: {
    /**
     * The soft item budget for one page of the day stream.
     *
     * A day is atomic: `limit` counts days and a day never splits across
     * pages, so a single day of 212 photographs arrives whole or not at all.
     * The guard against a page of ten such days is this budget rather than a
     * hard cut: the server stops adding days once the running visible-item
     * total passes it, and always returns at least one day however large.
     *
     * 400 because payload size is the real constraint rather than query time.
     * A 212-item day is roughly 150 KB of JSON once every `MediaRef` carries
     * a thumbnail and a display URL, so 400 items is the point at which one
     * response stops being something a phone on a train can hold
     * (`timeline.md` § Performance).
     */
    pageItemBudget: 400,
  },

  media: {
    /**
     * How long a signed media URL lives, in seconds.
     *
     * One hour (`timeline.md` Ruling 3). Comfortably longer than an
     * uninterrupted scroll, so the ordinary case never sees a URL expire, and
     * short enough that the bearer-link trade `architecture.md` § Where data
     * lives accepts stays small: anybody holding the URL can fetch those
     * bytes without a session for exactly that long.
     *
     * When one does expire the client refetches the affected page in place
     * and merges by id, which keeps scroll and re-evaluates visibility. There
     * is deliberately no re-signing route.
     */
    signedUrlTtlSeconds: 3600,
  },

  upload: {
    /**
     * How long a draft upload survives without being touched, in hours.
     *
     * A draft is a batch somebody started and has not committed: files chosen,
     * days grouped, maybe half an hour of tagging done. One member may have
     * only one open session, so an abandoned draft blocks them from starting
     * another until something clears it, and nothing did.
     *
     * A week, because the two failure modes are lopsided. Expiring too early
     * throws away work somebody meant to come back to, which is the thing the
     * whole upload flow exists to make painless. Expiring too late costs
     * nothing but a row: they simply see the batch they left and can cancel it
     * themselves. So this is set well past the point anybody returns, rather
     * than just past it.
     *
     * The alternative considered and rejected was letting a new upload adopt
     * or supersede the stale draft, which silently discards the tagging.
     */
    draftExpiryHours: 24 * 7,

    /**
     * How long a file may sit mid-transfer before it counts as abandoned, in
     * minutes.
     *
     * A committed batch whose browser was closed leaves `waiting` and
     * `sending` rows that nothing will ever finish. They have to become
     * `failed` with `problem_code = 'abandoned'`, or the batch never settles
     * and the people who can see the two hundred files that did arrive are
     * never told.
     *
     * Sixty, because that is the default `apis/upload.md` § Configuration
     * this slice reads gives for `upload.abandon_grace_minutes`, with the note
     * "Too short fails a slow file; too long delays the email". It is a
     * product number rather than a per-machine one, so it lives here rather
     * than as deployment configuration.
     *
     * The specification does not say why sixty, and the reason is worth
     * keeping, because it is what makes the number defensible rather than
     * merely chosen. Nothing reports progress: the browser PUTs straight to
     * Backblaze, and an upload-progress event is never posted back
     * (`apis/upload.md`), so the only writes that touch a batch are presign
     * and complete. "No progress for n minutes" therefore means "no server
     * contact for n minutes", which is the ordinary condition of a large
     * video that is transferring perfectly well. A presigned upload URL lives
     * `appConfig.upload.presignTtlSeconds` (an hour), so at sixty minutes the
     * URLs the file was handed have expired: the transfer cannot continue
     * without re-presigning, and re-presigning would itself have touched the
     * row. That is what makes an hour the first point at which silence is
     * proof rather than a guess, and it is the floor the specification's two
     * failure modes sit either side of.
     *
     * `upload_sessions.last_activity_at` is what this measures against, not
     * any one file's `updated_at`: the column is bumped by presign and by
     * complete so that the sweep has a batch-level activity signal, and a
     * per-file measure would fail the slow video the grace period exists to
     * protect.
     */
    abandonGraceMinutes: 60,

    /**
     * The types a file may declare and still be uploaded.
     *
     * What a phone and a messaging app produce: camera JPEG and HEIC/HEIF,
     * PNG screenshots, WebP and GIF from a chat, and QuickTime or MP4 video.
     * Anything else is refused at the manifest, before a byte moves, as a
     * row the batch still settles over rather than a failed request.
     */
    acceptedContentTypes: [
      "image/jpeg",
      "image/heic",
      "image/heif",
      "image/png",
      "image/webp",
      "image/gif",
      "video/quicktime",
      "video/mp4",
    ],

    /**
     * The largest file accepted, in bytes: 8 GiB.
     *
     * A long 4K phone video, and well inside multipart's 10,000-part ceiling
     * at `multipartPartSizeBytes` (8 GiB is 512 parts). Over it is a refusal
     * at the manifest, not a transfer that fails an hour in.
     */
    maxFileBytes: 8 * 1024 ** 3,

    /**
     * Files at or over this size go multipart, in bytes: 32 MiB.
     *
     * A file under it is one PUT with no server contact until it lands, and
     * the abandon sweep fails a batch left idle past `abandonGraceMinutes`. So
     * the largest single PUT has to cross `transferFloorBytesPerSecond` inside
     * that grace: 32 MiB takes about 34 minutes at the floor, where 64 MiB
     * would have taken about 68, longer than the 60-minute grace. Above it a
     * multipart upload re-presigns and completes part by part, so an expiry
     * costs one part rather than the file. The mockup's 184 MB video is well
     * above it. S3 allows a single PUT up to 5 GiB, far over this.
     */
    multipartThresholdBytes: 32 * 1024 ** 2,

    /**
     * One multipart part, in bytes: 16 MiB.
     *
     * The contract's figure. S3's minimum is 5 MiB for every part but the
     * last, and a part this size fits inside `presignTtlSeconds` on a slow
     * phone connection.
     */
    multipartPartSizeBytes: 16 * 1024 ** 2,

    /**
     * How long an upload URL lives, in seconds: one hour.
     *
     * The B2 client's old `UPLOAD_URL_SECONDS`, which this replaces. Kept
     * short because a write URL is permission to put new bytes in somebody's
     * bucket, and long enough that one `multipartPartSizeBytes` part crosses
     * `transferFloorBytesPerSecond` inside it. `abandonGraceMinutes` is set to
     * the same hour for the reason its own comment gives.
     */
    presignTtlSeconds: 3600,

    /**
     * The slowest connection the timing relations are designed to survive, in
     * bytes a second: 16 KiB/s, about 128 kbit/s, a poor mobile link.
     *
     * Three numbers are sized against it: a part must cross it inside
     * `presignTtlSeconds`, a file just under `multipartThresholdBytes` (one
     * PUT, no server contact) inside `abandonGraceMinutes`, and the tests that
     * hold those relations read this figure rather than a literal of their
     * own. It is also the rate the browser's re-presign arithmetic assumes, so
     * the client and the server agree on what "too slow" means.
     */
    transferFloorBytesPerSecond: 16 * 1024,

    /**
     * Files one uploader transfers at once.
     *
     * It limits concurrent transfers per uploader, and so the presign and
     * complete writes they cause at once on SQLite's single writer.
     *
     * Two, from the spike: four bought a phone nothing and cost memory, and
     * the contract's four assumed no derivative work. Each file in flight is
     * also a hash and a decode, so this is a memory budget as much as a
     * network one.
     */
    maxParallelTransfers: 2,

    /**
     * The longest one file's transfer waits for an offline browser to come
     * back, in minutes, in all.
     *
     * A failure while `navigator.onLine` is false (a lift, a tunnel, a
     * laptop lid) is not the link being bad: retrying it spends the file's
     * half a minute of backoff on a network that is not there. So the
     * transfer waits for the `online` event instead, without spending a try.
     * But nothing reaches the server while it waits, and the abandon sweep
     * fails a batch that has been silent for `abandonGraceMinutes`, so the
     * wait has to end well before that: twenty minutes, after which an
     * offline failure takes the ordinary backoff and the file is reported.
     */
    offlineWaitCeilingMinutes: 20,

    /**
     * The derivatives the browser makes beside each original.
     *
     * `display` is a phone's full screen at 2x and `thumb` a pile print at
     * 2x, both on the long edge and never upscaled. Always JPEG: WebKit
     * silently answers a WebP request with a PNG 5.7 times the size. WebKit's
     * JPEG encoder spends 1.7 to 1.9 times Chrome's bytes at one quality
     * setting, so it gets a lower one, chosen to narrow that gap. The spike
     * measured only the gap at equal quality, not the size at 0.72, so the
     * value is tuned in the proof run.
     */
    derivatives: {
      displayLongEdgePx: 2048,
      thumbLongEdgePx: 480,
      jpegQuality: { default: 0.82, webkit: 0.72 },
      /**
       * The largest derivative `complete` accepts, in bytes: 10 MiB.
       *
       * A derivative's PUT URL cannot limit what is sent to it, so the cap is
       * the server's word at `complete`, where Backblaze confirms the size:
       * anything over it is a `400`, and the browser drops such a
       * derivative before presigning it, as it drops one it cannot make. The
       * spike's largest was under 2 MB and WebKit's encoder spends up to 1.9
       * times Chrome's bytes, so this is generous, and still far under a
       * multipart original: nothing this size is a thumbnail.
       */
      maxBytes: 10 * 1024 ** 2,
    },

    /**
     * HEIC files one worker decodes through WASM before it is replaced.
     *
     * The libheif heap grows to its high-water mark on the largest file it
     * decodes (about 174 MB after a 24 MP file) and never shrinks. Recycling a
     * worker every few HEIC decodes bounds how long it holds that peak, while
     * letting a run reuse the loaded WASM module in between (design decision
     * 1). Eight is a judgement to tune in the proof run, not a measurement.
     */
    heicWorkerRecycleCount: 8,
  },

  items: {
    /**
     * Visible siblings the permalink carries inline.
     *
     * `ItemDetail.burstFrames` is capped here and
     * `burst.visibleFrameCount` says whether there are more, which
     * `GET /api/bursts/:burstId/frames` then serves. Sixty because the
     * fixtures' longest run is forty-five, so the ordinary burst arrives
     * whole and the cap only ever bites on something unusual.
     */
    burstStripMaxFrames: 60,
  },
} as const;
