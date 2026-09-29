import { describe, expect, it } from "vitest";
import {
  filterFacetsResponseSchema,
  personFacetSchema,
  tagFacetSchema,
  timelineRailRequestSchema,
  timelineRequestSchema,
  timelineResponseSchema,
} from "../src/timeline.ts";

const TAG_ID = "0199c0a0-0000-7000-8000-000000000001";
const OTHER_TAG_ID = "0199c0a0-0000-7000-8000-000000000002";

describe("timelineRequestSchema", () => {
  it("defaults to ten days and no filter", () => {
    expect(timelineRequestSchema.parse({})).toEqual({
      tags: [],
      people: [],
      from: undefined,
      until: undefined,
      attachedToMilestoneId: undefined,
      excludeAttached: false,
      limit: 10,
      cursor: undefined,
    });
  });

  it("takes one repeated parameter as an array either way", () => {
    expect(timelineRequestSchema.parse({ tags: TAG_ID }).tags).toEqual([
      TAG_ID,
    ]);
    expect(
      timelineRequestSchema.parse({ tags: [OTHER_TAG_ID, TAG_ID] }).tags,
    ).toEqual([TAG_ID, OTHER_TAG_ID]);
  });

  it("sorts and dedupes ids, so one selection has one digest", () => {
    expect(
      timelineRequestSchema.parse({ tags: [OTHER_TAG_ID, TAG_ID, TAG_ID] })
        .tags,
    ).toEqual([TAG_ID, OTHER_TAG_ID]);
  });

  it("drops an empty parameter rather than failing on it", () => {
    expect(timelineRequestSchema.parse({ tags: "" }).tags).toEqual([]);
  });

  it("coerces limit and refuses one over the cap", () => {
    expect(timelineRequestSchema.parse({ limit: "30" }).limit).toBe(30);
    expect(timelineRequestSchema.safeParse({ limit: "31" }).success).toBe(
      false,
    );
  });

  it("reads excludeAttached as a string, so `false` is false", () => {
    expect(
      timelineRequestSchema.parse({
        attachedToMilestoneId: TAG_ID,
        excludeAttached: "false",
      }).excludeAttached,
    ).toBe(false);
    expect(
      timelineRequestSchema.parse({
        attachedToMilestoneId: TAG_ID,
        excludeAttached: "true",
      }).excludeAttached,
    ).toBe(true);
  });

  it("refuses a malformed date", () => {
    expect(
      timelineRequestSchema.safeParse({ from: "14/09/2026" }).success,
    ).toBe(false);
  });
});

describe("timelineRailRequestSchema", () => {
  it("rejects limit and cursor rather than ignoring them", () => {
    expect(timelineRailRequestSchema.safeParse({ limit: "10" }).success).toBe(
      false,
    );
    expect(timelineRailRequestSchema.safeParse({ cursor: "abc" }).success).toBe(
      false,
    );
    expect(timelineRailRequestSchema.safeParse({}).success).toBe(true);
  });
});

describe("timelineResponseSchema", () => {
  it("is the collection envelope plus resultCount", () => {
    expect(
      timelineResponseSchema.parse({
        days: [],
        nextCursor: null,
        resultCount: null,
      }),
    ).toEqual({ days: [], nextCursor: null, resultCount: null });
  });

  it("refuses a day with no counts", () => {
    expect(
      timelineResponseSchema.safeParse({
        days: [{ capturedOn: "2026-09-14", items: [] }],
        nextCursor: null,
        resultCount: null,
      }).success,
    ).toBe(false);
  });
});

describe("tagFacetSchema", () => {
  const tag = { tagId: TAG_ID, name: "beach" };

  it("carries a narrowed count when the chip is not selected", () => {
    expect(
      tagFacetSchema.safeParse({
        tag,
        isSelected: false,
        narrowedCount: 0,
        ownCount: null,
      }).success,
    ).toBe(true);
  });

  it("carries an own count when it is", () => {
    expect(
      tagFacetSchema.safeParse({
        tag,
        isSelected: true,
        narrowedCount: null,
        ownCount: 141,
      }).success,
    ).toBe(true);
  });

  it("refuses a chip carrying both numbers or neither", () => {
    expect(
      tagFacetSchema.safeParse({
        tag,
        isSelected: true,
        narrowedCount: 3,
        ownCount: 141,
      }).success,
    ).toBe(false);
    expect(
      tagFacetSchema.safeParse({
        tag,
        isSelected: false,
        narrowedCount: null,
        ownCount: null,
      }).success,
    ).toBe(false);
  });

  it("refuses a chip carrying exactly one count, but the wrong one", () => {
    expect(
      tagFacetSchema.safeParse({
        tag,
        isSelected: true,
        narrowedCount: 3,
        ownCount: null,
      }).success,
    ).toBe(false);
    expect(
      tagFacetSchema.safeParse({
        tag,
        isSelected: false,
        narrowedCount: null,
        ownCount: 141,
      }).success,
    ).toBe(false);
  });
});

describe("personFacetSchema", () => {
  it("refuses a chip carrying exactly one count, but the wrong one", () => {
    const person = { personId: TAG_ID, displayName: "Elena" };

    expect(
      personFacetSchema.safeParse({
        person,
        isSelected: true,
        narrowedCount: 3,
        ownCount: null,
      }).success,
    ).toBe(false);
  });
});

describe("filterFacetsResponseSchema", () => {
  it("takes zero as a real answer", () => {
    expect(
      filterFacetsResponseSchema.parse({ tags: [], people: [], resultCount: 0 })
        .resultCount,
    ).toBe(0);
  });
});
