import { describe, expect, it } from "vitest";
import {
  putVideoReactionRequestSchema,
  videoReactionEmojiSchema,
} from "../src/videoReactions.ts";
import { createCommentRequestSchema } from "../src/comments.ts";

describe("video conversation writes", () => {
  it("preserves a fractional moment and accepts the approved emoji set", () => {
    expect(
      putVideoReactionRequestSchema.parse({ emoji: "👏", atSeconds: 1.25 }),
    ).toEqual({ emoji: "👏", atSeconds: 1.25 });
    expect(videoReactionEmojiSchema.safeParse("unknown").success).toBe(false);
  });
  it.each([-1, NaN, Infinity])(
    "rejects an invalid position %s",
    (atSeconds) => {
      expect(
        putVideoReactionRequestSchema.safeParse({ emoji: "❤️", atSeconds })
          .success,
      ).toBe(false);
    },
  );
  it("keeps a reply parent while trimming the comment", () => {
    const parentCommentId = "018f0000-0000-7000-8000-00000000d109";
    expect(
      createCommentRequestSchema.parse({ body: " Hello ", parentCommentId }),
    ).toMatchObject({ body: "Hello", parentCommentId });
  });
});
