import { describe, expect, it } from "vitest";
import * as shared from "./index.ts";

const ITEM_ID = "018f0000-0000-7000-8000-00000000f001";

describe("safe media request contracts", () => {
  it("rejects malformed IDs, empty batches and nine IDs before deduplicating", () => {
    expect(shared.mediaPreviewRequestSchema).toBeDefined();
    [
      [],
      ["not-an-id"],
      Array.from({ length: 9 }, () => {
        return ITEM_ID;
      }),
    ].forEach((itemIds) => {
      expect(
        shared.mediaPreviewRequestSchema.safeParse({
          itemIds,
          purpose: "speculative-preview",
        }).success,
      ).toBe(false);
    });
    expect(
      shared.mediaPreviewRequestSchema.parse({
        itemIds: [ITEM_ID, ITEM_ID],
        purpose: "selected-view",
      }).itemIds,
    ).toEqual([ITEM_ID]);
  });

  it("preserves typed selection fields and rejects invalid dates and client cursors", () => {
    expect(shared.mediaNeighborsRequestSchema).toBeDefined();
    const request = {
      itemId: ITEM_ID,
      direction: "next",
      selection: {
        tags: [ITEM_ID],
        people: [],
        from: "2026-09-01",
        until: "2026-09-30",
        attachedToMilestoneId: ITEM_ID,
        excludeAttached: true,
      },
    };
    expect(shared.mediaNeighborsRequestSchema.parse(request)).toEqual(request);
    expect(
      shared.mediaNeighborsRequestSchema.safeParse({
        ...request,
        selection: { ...request.selection, from: "2026-02-30" },
      }).success,
    ).toBe(false);
    expect(
      shared.mediaNeighborsRequestSchema.safeParse({
        ...request,
        selection: { ...request.selection, cursor: "sql" },
      }).success,
    ).toBe(false);
  });
});
