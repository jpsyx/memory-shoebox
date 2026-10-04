import { afterEach, describe, expect, it, vi } from "vitest";
import { createMailDomainReader } from "../../src/mail/createMailDomainReader.ts";
import { createTestConfig } from "../helpers/createTestConfig.ts";

function _domain(name: string, status = "verified", sending = "enabled") {
  return {
    id: name,
    name,
    status,
    capabilities: { sending, receiving: "disabled" },
    created_at: "2026-10-01T00:00:00.000Z",
    region: "us-east-1",
  };
}

function _pages(pages: unknown[]) {
  let pageIndex = 0;
  vi.stubGlobal("fetch", async () => {
    const page = pages[pageIndex++];
    if (page === undefined) {
      throw new Error("Unexpected provider request");
    }
    return new Response(JSON.stringify(page), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("mail domain reader", () => {
  it("finds the exact sender domain on later provider pages", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const isSecondPage =
        new URL(url).searchParams.get("after") === "sub.example.com";
      return new Response(
        JSON.stringify({
          data: [_domain(isSecondPage ? "example.com" : "sub.example.com")],
          has_more: !isSecondPage,
        }),
        { status: 200 },
      );
    });
    const reader = createMailDomainReader(
      createTestConfig({ RESEND_API_KEY: "fake-key" }),
    );
    expect(await reader?.("example.com")).toEqual({
      isVerified: true,
      error: undefined,
    });
  });

  it.each([
    ["pending", "enabled"],
    ["verified", "disabled"],
    ["partially_verified", "enabled"],
  ])("rejects status %s with sending %s", async (status, sending) => {
    _pages([
      { data: [_domain("example.com", status, sending)], has_more: false },
    ]);
    const reader = createMailDomainReader(
      createTestConfig({ RESEND_API_KEY: "fake-key" }),
    );
    expect(await reader?.("example.com")).toEqual({
      isVerified: false,
      error: undefined,
    });
  });

  it("does not use parent or child domain verification", async () => {
    _pages([{ data: [_domain("example.com")], has_more: false }]);
    const reader = createMailDomainReader(
      createTestConfig({ RESEND_API_KEY: "fake-key" }),
    );
    expect((await reader?.("sub.example.com"))?.isVerified).toBe(false);
  });

  it("caches each domain for 60 seconds and keeps domain changes separate", async () => {
    vi.useFakeTimers();
    _pages([
      { data: [_domain("example.com")], has_more: false },
      { data: [_domain("other.com", "pending")], has_more: false },
      { data: [_domain("example.com", "pending")], has_more: false },
    ]);
    const reader = createMailDomainReader(
      createTestConfig({ RESEND_API_KEY: "fake-key" }),
    );
    expect((await reader?.("example.com"))?.isVerified).toBe(true);
    expect((await reader?.("other.com"))?.isVerified).toBe(false);
    vi.advanceTimersByTime(59_999);
    expect((await reader?.("example.com"))?.isVerified).toBe(true);
    vi.advanceTimersByTime(1);
    expect((await reader?.("example.com"))?.isVerified).toBe(false);
  });

  it("sanitizes provider errors", async () => {
    vi.stubGlobal("fetch", async () => {
      return new Response(
        JSON.stringify({
          name: "validation_error",
          message: "secret key fake-key, sign-in code 410233",
        }),
        { status: 403 },
      );
    });
    const reader = createMailDomainReader(
      createTestConfig({ RESEND_API_KEY: "fake-key" }),
    );
    const result = await reader?.("example.com");
    expect(result?.isVerified).toBe(false);
    expect(result?.error).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain("fake-key");
    expect(JSON.stringify(result)).not.toContain("410233");
  });

  it("has no reader without a key or while using fake delivery", () => {
    expect(createMailDomainReader(createTestConfig())).toBeUndefined();
    expect(
      createMailDomainReader(
        createTestConfig({
          RESEND_API_KEY: "fake-key",
          ENABLE_FAKE_EMAIL: "true",
        }),
      ),
    ).toBeUndefined();
  });
});
