import { describe, expect, it } from "vitest";
import {
  createSessionRequestSchema,
  listMySessionsResponseSchema,
  meDtoSchema,
  requestSignInCodeRequestSchema,
  updateMeRequestSchema,
} from "../src/auth.ts";

const MEMBER_ID = "0192f2a0-7d3c-7000-8000-000000000001";

describe("requestSignInCodeRequestSchema", () => {
  it("normalises the address before anything else touches it", () => {
    const parsed = requestSignInCodeRequestSchema.parse({
      email: "  Abuela@Example.COM ",
    });
    expect(parsed.email).toBe("abuela@example.com");
  });

  it("rejects a value that is not an address", () => {
    expect(() => {
      return requestSignInCodeRequestSchema.parse({ email: "abuela" });
    }).toThrow();
  });
});

describe("createSessionRequestSchema", () => {
  it("takes exactly six digits", () => {
    const parsed = createSessionRequestSchema.parse({
      email: "abuela@example.com",
      code: "410233",
    });
    expect(parsed.code).toBe("410233");
  });

  it.each(["41023", "4102333", "41023a", ""])(
    "rejects %s, which is not six digits",
    (code) => {
      expect(() => {
        return createSessionRequestSchema.parse({
          email: "abuela@example.com",
          code,
        });
      }).toThrow();
    },
  );
});

describe("updateMeRequestSchema", () => {
  it("leaves an omitted field absent rather than undefined", () => {
    expect(updateMeRequestSchema.parse({})).toEqual({});
  });

  it("clears the display name with null", () => {
    expect(updateMeRequestSchema.parse({ displayName: null })).toEqual({
      displayName: null,
    });
  });

  it("trims the display name", () => {
    expect(updateMeRequestSchema.parse({ displayName: "  Rosa " })).toEqual({
      displayName: "Rosa",
    });
  });

  it("rejects a display name over the cap", () => {
    expect(() => {
      return updateMeRequestSchema.parse({ displayName: "r".repeat(81) });
    }).toThrow();
  });

  it("rejects email, which is never writable anywhere", () => {
    expect(() => {
      return updateMeRequestSchema.parse({ email: "new@example.com" });
    }).toThrow();
  });

  it("rejects role, because nobody promotes themselves", () => {
    expect(() => {
      return updateMeRequestSchema.parse({ role: "admin" });
    }).toThrow();
  });

  it("requires all four switches when notify is present", () => {
    expect(() => {
      return updateMeRequestSchema.parse({ notify: { onUpload: false } });
    }).toThrow();
  });
});

describe("meDtoSchema", () => {
  it("carries the caller's own address and the raw stored name", () => {
    const parsed = meDtoSchema.parse({
      member: { memberId: MEMBER_ID, displayName: "Abuela Rosa" },
      storedDisplayName: null,
      email: "abuela@example.com",
      role: "viewer",
      notify: {
        onUpload: true,
        onComment: true,
        onReply: true,
        onRemoval: true,
      },
      joinedAt: "2026-09-27T10:00:00.000Z",
      lastSignedInAt: "2026-09-27T10:00:00.000Z",
    });
    expect(parsed.storedDisplayName).toBeNull();
  });
});

describe("listMySessionsResponseSchema", () => {
  it("is the collection envelope with a null cursor", () => {
    const parsed = listMySessionsResponseSchema.parse({
      sessions: [
        {
          sessionId: MEMBER_ID,
          deviceLabel: "iPhone, Safari",
          createdAt: "2026-09-27T10:00:00.000Z",
          lastUsedAt: "2026-09-27T10:00:00.000Z",
          expiresAt: "2026-10-27T10:00:00.000Z",
          isCurrent: true,
        },
      ],
      nextCursor: null,
    });
    expect(parsed.sessions[0]?.isCurrent).toBe(true);
  });
});
