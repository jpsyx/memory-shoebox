import { describe, expect, it } from "vitest";
import {
  createCommentRequestSchema,
  setReactionRequestSchema,
  updateCommentRequestSchema,
} from "../src/comments.ts";

describe("createCommentRequestSchema", () => {
  it("trims the body and keeps a pinned moment", () => {
    const parsed = createCommentRequestSchema.parse({
      body: "  He has your father's chin.  ",
      atSeconds: 12.5,
    });

    expect(parsed.body).toBe("He has your father's chin.");
    expect(parsed.atSeconds).toBe(12.5);
  });

  it("rejects an empty body, a whitespace body and a body over 4000", () => {
    expect(() => {
      return createCommentRequestSchema.parse({ body: "" });
    }).toThrow();

    expect(() => {
      return createCommentRequestSchema.parse({ body: "   " });
    }).toThrow();

    expect(() => {
      return createCommentRequestSchema.parse({ body: "x".repeat(4001) });
    }).toThrow();
  });

  it("rejects a negative pin", () => {
    expect(() => {
      return createCommentRequestSchema.parse({ body: "No", atSeconds: -1 });
    }).toThrow();
  });
});

describe("updateCommentRequestSchema", () => {
  it("cannot move the pin", () => {
    const parsed = updateCommentRequestSchema.parse({
      body: "Edited",
      atSeconds: 90,
    });

    expect(parsed).toEqual({ body: "Edited" });
  });
});

describe("setReactionRequestSchema", () => {
  it("rejects a kind outside the six", () => {
    expect(setReactionRequestSchema.parse({ kind: "love" }).kind).toBe("love");
    expect(() => {
      return setReactionRequestSchema.parse({ kind: "angry" });
    }).toThrow();
  });
});

describe("comment tag request compatibility", () => {
  const memberId = "0192f2a0-7d3c-7000-8000-000000000001";
  it("defaults creates but preserves omitted update occurrences", () => {
    expect(
      createCommentRequestSchema.parse({ body: "Hello" }).commentTags,
    ).toEqual([]);
    expect(
      updateCommentRequestSchema.parse({ body: "Hello" }).commentTags,
    ).toBeUndefined();
  });
  it("normalizes UTF-16 offsets with the body", () => {
    expect(
      createCommentRequestSchema.parse({
        body: "  😀 @Jorge  ",
        commentTags: [{ memberId, start: 5, end: 11 }],
      }),
    ).toEqual({
      body: "😀 @Jorge",
      commentTags: [{ memberId, start: 3, end: 9 }],
    });
  });
  it("accepts 4000 normalized UTF-16 units and rejects 4001", () => {
    expect(
      createCommentRequestSchema.parse({ body: `  ${"x".repeat(4000)}  ` })
        .body,
    ).toHaveLength(4000);
    expect(
      updateCommentRequestSchema.safeParse({ body: "x".repeat(4001) }).success,
    ).toBe(false);
  });
  it.each([
    [
      { memberId, start: 1, end: 4 },
      { memberId, start: 3, end: 5 },
    ],
    [
      { memberId, start: 3, end: 5 },
      { memberId, start: 1, end: 2 },
    ],
    [{ memberId, start: -1, end: 3 }],
    [{ memberId, start: 1.5, end: 3 }],
    [{ memberId, start: 1, end: 99 }],
    [{ memberId, start: 2, end: 2 }],
  ])("rejects invalid raw ranges %j", (...commentTags) => {
    expect(
      createCommentRequestSchema.safeParse({ body: "@Jorge", commentTags })
        .success,
    ).toBe(false);
  });
  it.each([
    [0, 2],
    [2, 4],
    [3, 6],
    [4, 7],
  ])("rejects trimmed or split-surrogate range %i:%i", (start, end) => {
    expect(
      updateCommentRequestSchema.safeParse({
        body: "  @😀  ",
        commentTags: [{ memberId, start, end }],
      }).success,
    ).toBe(false);
  });
  it("rejects duplicate retained IDs", () => {
    expect(
      updateCommentRequestSchema.safeParse({
        body: "@A @B",
        commentTags: [
          { memberId, start: 0, end: 2, tagId: memberId },
          { memberId, start: 3, end: 5, tagId: memberId },
        ],
      }).success,
    ).toBe(false);
  });
});
