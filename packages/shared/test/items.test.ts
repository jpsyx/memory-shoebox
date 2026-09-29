import { describe, expect, it } from "vitest";
import { itemsSeenRequestSchema } from "../src/items.ts";

const TAG_ID = "0199c0a0-0000-7000-8000-000000000001";

describe("itemsSeenRequestSchema", () => {
  it("defaults burstIds to none", () => {
    expect(itemsSeenRequestSchema.parse({ itemIds: [TAG_ID] })).toEqual({
      itemIds: [TAG_ID],
      burstIds: [],
    });
  });

  it("refuses more than five hundred ids", () => {
    const itemIds = Array.from({ length: 501 }, () => {
      return TAG_ID;
    });
    expect(itemsSeenRequestSchema.safeParse({ itemIds }).success).toBe(false);
  });

  it("refuses an id that is not a uuid", () => {
    expect(itemsSeenRequestSchema.safeParse({ itemIds: ["7"] }).success).toBe(
      false,
    );
  });
});
