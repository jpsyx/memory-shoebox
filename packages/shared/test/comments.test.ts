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
