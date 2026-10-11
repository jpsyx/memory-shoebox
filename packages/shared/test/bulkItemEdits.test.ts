import { describe, expect, it } from "vitest";
import { bulkEditItemsRequestSchema } from "../src/index.ts";

const ITEM_ID = "0199a0d4-0000-7000-8000-000000000001";

describe("bulkEditItemsRequestSchema", () => {
  it.each([
    [],
    [ITEM_ID, ITEM_ID],
    Array.from({ length: 501 }, (_unused, index) => {
      return `0199a0d4-0000-7000-8000-${String(index).padStart(12, "0")}`;
    }),
  ])("rejects invalid selections", (itemIds) => {
    expect(
      bulkEditItemsRequestSchema.safeParse({ action: "delete", itemIds })
        .success,
    ).toBe(false);
  });
  it("accepts a bounded selection of 500 distinct items", () => {
    const itemIds = Array.from({ length: 500 }, (_unused, index) => {
      return `0199a0d4-0000-7000-8000-${String(index).padStart(12, "0")}`;
    });
    expect(
      bulkEditItemsRequestSchema.parse({ action: "delete", itemIds }).itemIds,
    ).toHaveLength(500);
  });
  it.each([
    { action: "tags", tags: [" "] },
    { action: "people", people: [{ displayName: " " }] },
    { action: "milestone", milestoneId: "missing" },
    { action: "unknown" },
  ])("rejects invalid action values", (fields) => {
    expect(
      bulkEditItemsRequestSchema.safeParse({ itemIds: [ITEM_ID], ...fields })
        .success,
    ).toBe(false);
  });
});
