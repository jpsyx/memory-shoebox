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
  },
} as const;
