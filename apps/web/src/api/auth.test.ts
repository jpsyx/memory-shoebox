import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, deleteSession, requestSignInCode } from "@/api/auth";

function _respondWith(body: unknown, status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestSignInCode", () => {
  it("posts the address to the mint route", async () => {
    _respondWith(
      { email: "abuela@example.com", expiresAt: "2026-09-28T10:10:00.000Z" },
      202,
    );

    await requestSignInCode({ email: "abuela@example.com", isResend: false });

    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/sign-in-codes",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "abuela@example.com" }),
      }),
    );
  });

  it("posts to the resend route instead when asked for another", async () => {
    _respondWith(
      { email: "abuela@example.com", expiresAt: "2026-09-28T10:10:00.000Z" },
      202,
    );

    await requestSignInCode({ email: "abuela@example.com", isResend: true });

    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/sign-in-codes/resend",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("createSession", () => {
  it("returns the parsed session, which carries the shell's settings", async () => {
    _respondWith(
      {
        me: {
          member: {
            memberId: "018f0000-0000-7000-8000-000000000000",
            displayName: "Abuela",
          },
          storedDisplayName: null,
          email: "abuela@example.com",
          role: "viewer",
          notify: {
            onUpload: true,
            onComment: true,
            onReply: true,
            onRemoval: true,
          },
          joinedAt: "2026-09-28T10:00:00.000Z",
          lastSignedInAt: "2026-09-28T10:00:00.000Z",
        },
        session: {
          sessionId: "018f0000-0000-7000-8000-000000000001",
          deviceLabel: "iPhone, Safari",
          createdAt: "2026-09-28T10:00:00.000Z",
          lastUsedAt: "2026-09-28T10:00:00.000Z",
          expiresAt: "2026-10-28T10:00:00.000Z",
          isCurrent: true,
        },
        isFirstSignIn: true,
        settings: {
          shoeboxName: "My Shoebox",
          pileArrangement: "messy",
          timezone: "Europe/Madrid",
        },
      },
      201,
    );

    const created = await createSession({
      email: "abuela@example.com",
      code: "410233",
    });

    expect(created.isFirstSignIn).toBe(true);
    expect(created.settings.shoeboxName).toBe("My Shoebox");
  });
});

describe("deleteSession", () => {
  it("accepts the 204 the route answers even on a dead cookie", async () => {
    _respondWith(undefined, 204);

    await expect(deleteSession()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
