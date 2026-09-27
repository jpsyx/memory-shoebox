import { describe, expect, it } from "vitest";
import { createId } from "../src/db/ids.ts";

describe("createId", () => {
  it("returns a v7 uuid", () => {
    const id = createId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("sorts lexicographically in creation order, including within one millisecond", () => {
    const ids = Array.from({ length: 10_000 }, () => {
      return createId();
    });
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it("never repeats an id", () => {
    const ids = Array.from({ length: 10_000 }, () => {
      return createId();
    });
    expect(new Set(ids).size).toBe(ids.length);
  });
});
