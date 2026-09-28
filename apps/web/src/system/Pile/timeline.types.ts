import type { ItemSummary, MilestoneRef } from "@memory-shoebox/shared";

/*
 * `TimelineDay` and its two milestone shapes are specified in full in
 * `docs/prds/2026-09-27-memory-shoebox/tech-specs/apis/timeline.md`
 * § Shared types, where they are `timelineResponseSchema`'s members. They
 * are declared here because the pile is built before the route that serves
 * it, and this is a transcription of that normative document rather than a
 * design of its own. They belong in `@memory-shoebox/shared` once that
 * package carries these types; until then, this file is the only copy.
 */

/** One occasion opening on this day. One at most, resolved by the server. */
export type DayMilestoneBand = {
  readonly milestone: MilestoneRef;
  /** 1-based position of this day within the span. */
  readonly dayPosition: number;
  /** Total days in the span, both ends counted. 1 for a one-day occasion. */
  readonly dayCount: number;
  /** The whole occasion's per-viewer total, for the band's "212 items". */
  readonly itemCount: number;
};

/** Every other occasion covering this day, as a continuation strip. */
export type DayMilestoneStrip = {
  readonly milestone: MilestoneRef;
  readonly dayPosition: number;
  readonly dayCount: number;
};

export type TimelineDay = {
  /** `YYYY-MM-DD`, local to the Shoebox timezone. The grouping key. */
  readonly capturedOn: string;
  /** Every visible item on the day, burst frames counted individually. */
  readonly itemCount: number;
  /** Visible items with no view record for this viewer. Drives "31 new". */
  readonly unseenCount: number;
  readonly milestoneBand: DayMilestoneBand | null;
  readonly milestoneStrips: readonly DayMilestoneStrip[];
  /** One entry per print the pile draws. Empty on a milestone-only day. */
  readonly items: readonly ItemSummary[];
};
