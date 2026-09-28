import { describe, expect, it } from "vitest";
import { collectionSchema, cursorSchema } from "../src/collectionSchema.ts";
import { memberRefSchema } from "../src/dtos.ts";

/** The envelope surface 6 and surface 12 both return, built the one way. */
const membersResponseSchema = collectionSchema("members", memberRefSchema);

/** A member reference, which every fixture below carries. */
const memberRef = {
  memberId: "0199a1f0-2c3d-7e4a-8b5c-6d7e8f901234",
  displayName: "Abuela Rosa",
};

describe("cursorSchema", () => {
  it("accepts any non-empty string, because the cursor is opaque", () => {
    // `conventions.md` § Pagination: what a cursor encodes is a per-route
    // decision, so nothing here may constrain its shape. These three are the
    // three forms the slices actually mint.
    [
      "2026-08-14",
      "0199a1f0-2c3d-7e4a-8b5c-6d7e8f905678",
      "eyJjYXB0dXJlZE9uIjoiMjAyNi0wOC0xNCJ9",
    ].forEach((cursor) => {
      expect(cursorSchema.safeParse(cursor).success).toBe(true);
    });
  });

  it("rejects the empty string, because the end is spelled null", () => {
    expect(cursorSchema.safeParse("").success).toBe(false);
  });
});

describe("collectionSchema", () => {
  it("builds the envelope the conventions specify, keyed by the resource name", () => {
    const page = { members: [memberRef], nextCursor: "0199a1f0" };
    expect(membersResponseSchema.parse(page)).toEqual(page);
  });

  it("accepts null as the end of the collection", () => {
    expect(
      membersResponseSchema.safeParse({ members: [], nextCursor: null })
        .success,
    ).toBe(true);
  });

  it("requires nextCursor rather than allowing it to be absent", () => {
    // § Envelope writes `"nextCursor": string | null` and § Pagination says
    // `nextCursor: null` means the end. So the key is always present: an
    // optional one would make a route that forgot to set it read exactly like
    // one that reached the end.
    expect(membersResponseSchema.safeParse({ members: [] }).success).toBe(
      false,
    );
    expect(
      membersResponseSchema.safeParse({ members: [], nextCursor: undefined })
        .success,
    ).toBe(false);
  });

  it("rejects a bare top-level array", () => {
    // § Envelope: "Never a bare top-level array."
    expect(membersResponseSchema.safeParse([memberRef]).success).toBe(false);
  });

  it("validates the items through the schema it was given", () => {
    expect(
      membersResponseSchema.safeParse({
        members: [{ memberId: "not-a-uuid", displayName: "Abuela Rosa" }],
        nextCursor: null,
      }).success,
    ).toBe(false);
  });

  it("keys the page by the resource name it was given and nothing else", () => {
    const commentsResponseSchema = collectionSchema(
      "comments",
      memberRefSchema,
    );
    const parsed = commentsResponseSchema.parse({
      comments: [memberRef],
      nextCursor: null,
    });
    expect(Object.keys(parsed).sort()).toEqual(["comments", "nextCursor"]);
    // The key is part of the contract: a page under the wrong name is not the
    // envelope this route promised.
    expect(
      commentsResponseSchema.safeParse({ members: [], nextCursor: null })
        .success,
    ).toBe(false);
  });
});
