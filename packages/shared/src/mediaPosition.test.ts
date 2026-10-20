import { describe, expect, it } from "vitest";
import {
  mediaPositionRequestSchema,
  mediaPositionResponseSchema,
} from "./mediaPosition.ts";

const itemId = "018f0000-0000-7000-8000-00000000f001";
describe("media position contract", () => {
  it("requires an item and a strict timeline selection", () => {
    expect(
      mediaPositionRequestSchema.parse({
        itemId,
        selection: { tags: [], people: [] },
      }),
    ).toEqual({ itemId, selection: { tags: [], people: [] } });
    expect(
      mediaPositionRequestSchema.safeParse({ itemId: "bad", selection: {} })
        .success,
    ).toBe(false);
    expect(
      mediaPositionRequestSchema.safeParse({
        itemId,
        selection: { tags: [], people: [], sql: "anything" },
      }).success,
    ).toBe(false);
  });
  it("accepts authorized ranks or null and rejects impossible counters", () => {
    expect(mediaPositionResponseSchema.parse(null)).toBeNull();
    expect(
      mediaPositionResponseSchema.parse({ position: 4, total: 4 }),
    ).toEqual({ position: 4, total: 4 });
    [
      { position: 0, total: 4 },
      { position: -1, total: 4 },
      { position: 1.5, total: 4 },
      { position: 1, total: 0 },
      { position: 1, total: 2.5 },
      { position: 5, total: 4 },
    ].forEach((counter) => {
      expect(mediaPositionResponseSchema.safeParse(counter).success).toBe(
        false,
      );
    });
  });
});
