import { describe, expect, it } from "vitest";
import { peopleResponseSchema } from "../src/vocabularies.ts";

describe("peopleResponseSchema", () => {
  it("is the collection envelope plus peopleCount", () => {
    expect(
      peopleResponseSchema.parse({
        people: [],
        nextCursor: null,
        peopleCount: 0,
      }),
    ).toEqual({ people: [], nextCursor: null, peopleCount: 0 });
  });
});
