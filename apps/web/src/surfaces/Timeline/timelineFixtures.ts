import type {
  BurstSummary,
  DayMilestoneBand,
  ItemSummary,
  MediaSource,
  TimelineDay,
} from "@memory-shoebox/shared";

/**
 * Canned days, shared by every test under `Timeline/`.
 *
 * Written by hand rather than fetched, because these are the shapes the
 * contract fixes and a fixture that drifts from them is a test that passes
 * against nothing.
 *
 * It sits beside the components rather than inside one suite's `__tests__/`
 * because two suites need it: `DayBlock`'s own unit test and the surface's
 * integration suite. It holds nothing but those shapes: the stubbed `fetch`
 * and the memory router live in `TimelineSurface/__tests__/`, where only the
 * tests that render the whole route can reach them.
 */

/** An hour away, which is the signed lifetime every source really gets. */
export const FAR_FUTURE = "2099-01-01T00:00:00.000Z";

/** One signed media source, with sensible defaults. */
export function makeMediaSource(
  overrides: Partial<MediaSource> = {},
): MediaSource {
  return {
    url: "https://example.invalid/thumb.jpg",
    expiresAt: FAR_FUTURE,
    width: 400,
    height: 267,
    ...overrides,
  };
}

/** One item, with sensible defaults. */
export function makeItem(overrides: Partial<ItemSummary> = {}): ItemSummary {
  return {
    itemId: "018f0000-0000-7000-8000-00000000a001",
    kind: "photo",
    capturedAt: "2026-09-27T08:00:00.000Z",
    capturedOn: "2026-09-27",
    media: {
      thumb: makeMediaSource(),
      display: makeMediaSource({ width: 1600, height: 1067 }),
      poster: null,
      video: null,
      durationMs: null,
      altText: "A cartoon baby, 27 September 2026.",
    },
    isUnseen: false,
    uploadedBy: {
      memberId: "018f0000-0000-7000-8000-00000000c001",
      displayName: "Papá",
    },
    visibility: { mode: "everyone", label: null, subjects: [] },
    burst: null,
    ...overrides,
  };
}

/** One burst, with sensible defaults. */
export function makeBurst(overrides: Partial<BurstSummary> = {}): BurstSummary {
  return {
    burstId: "018f0000-0000-7000-8000-00000000b001",
    visibleFrameCount: 45,
    startsAt: "2026-09-26T06:41:00.000Z",
    endsAt: "2026-09-26T06:44:00.000Z",
    coverItemId: "018f0000-0000-7000-8000-00000000a001",
    hasUnseenFrames: true,
    ...overrides,
  };
}

/** One day, with sensible defaults. */
export function makeDay(overrides: Partial<TimelineDay> = {}): TimelineDay {
  return {
    capturedOn: "2026-09-27",
    itemCount: 3,
    unseenCount: 0,
    milestoneBand: null,
    milestoneStrips: [],
    items: [makeItem()],
    ...overrides,
  };
}

/** One occasion, as a band. */
export function makeBand(
  overrides: Partial<DayMilestoneBand> = {},
): DayMilestoneBand {
  return {
    milestone: {
      milestoneId: "018f0000-0000-7000-8000-00000000d001",
      name: "The first birthday",
      startsOn: "2026-09-26",
      endsOn: "2026-09-26",
      blurb: "One candle.",
    },
    dayPosition: 1,
    dayCount: 1,
    itemCount: 48,
    ...overrides,
  };
}
