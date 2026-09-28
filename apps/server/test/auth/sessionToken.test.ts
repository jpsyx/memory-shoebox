import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  makeTokenHashFromToken,
} from "../../src/auth/sessionToken.ts";

describe("createSessionToken", () => {
  it("is 256 bits, url-safe, and never the same twice", () => {
    const token = createSessionToken();
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toBe(createSessionToken());
  });
});

describe("makeTokenHashFromToken", () => {
  it("is a stable 64-character hex digest", () => {
    expect(makeTokenHashFromToken("abc123")).toHaveLength(64);
    expect(makeTokenHashFromToken("abc123")).toBe(
      makeTokenHashFromToken("abc123"),
    );
  });

  it("is not the token", () => {
    expect(makeTokenHashFromToken("abc123")).not.toContain("abc123");
  });
});
