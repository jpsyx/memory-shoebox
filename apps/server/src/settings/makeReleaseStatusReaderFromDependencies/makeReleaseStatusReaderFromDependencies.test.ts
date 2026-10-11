import { describe, expect, it, vi } from "vitest";
import { makeReleaseStatusReaderFromDependencies } from "./makeReleaseStatusReaderFromDependencies.ts";

const NOW = "2026-10-11T00:00:00.000Z";

function _response(tag = "v1.10.0"): Response {
  return Response.json({ tag_name: tag, draft: false, prerelease: false });
}

describe("published release checks", () => {
  it.each([
    ["1.9.9", "v1.10.0", "update_available"],
    ["1.10.0", "v1.10.0", "up_to_date"],
    ["2.0.0", "v1.10.0", "up_to_date"],
    ["1.0.9", "v1.0.10", "update_available"],
  ])(
    "compares installed %s with %s numerically",
    async (currentVersion, tag, status) => {
      const reader = makeReleaseStatusReaderFromDependencies({
        currentVersion,
        request: async () => {
          return _response(tag);
        },
        clock: () => {
          return new Date(NOW);
        },
      });
      expect(await reader()).toEqual({
        status,
        latestVersion: tag.slice(1),
        checkedAt: NOW,
      });
    },
  );

  it("requests only public release metadata and reuses it for one hour", async () => {
    let instant = new Date(NOW).getTime();
    const request = vi.fn(async () => {
      return _response();
    });
    const reader = makeReleaseStatusReaderFromDependencies({
      currentVersion: "1.0.0",
      request,
      clock: () => {
        return new Date(instant);
      },
    });
    await reader();
    instant += 3_599_999;
    await reader();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "https://api.github.com/repos/jpsyx/memory-shoebox/releases/latest",
      expect.objectContaining({
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10",
          "User-Agent": "Memory-Shoebox",
        },
        signal: expect.any(AbortSignal),
      }),
    );
    instant += 1;
    await reader();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight request between simultaneous reads", async () => {
    let finish = () => {};
    const gate = new Promise<void>((settle) => {
      finish = settle;
    });
    const request = vi.fn(async () => {
      await gate;
      return _response();
    });
    const reader = makeReleaseStatusReaderFromDependencies({
      currentVersion: "1.0.0",
      request,
    });
    const first = reader();
    const second = reader();
    finish();
    expect(await first).toEqual(await second);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([404, 403, 429, 500])(
    "reports unavailable for HTTP %s and retries after five minutes",
    async (status) => {
      let instant = new Date(NOW).getTime();
      const request = vi.fn(async () => {
        return new Response("", { status });
      });
      const reader = makeReleaseStatusReaderFromDependencies({
        currentVersion: "1.0.0",
        request,
        clock: () => {
          return new Date(instant);
        },
      });
      expect(await reader()).toEqual({
        status: "unavailable",
        latestVersion: null,
        checkedAt: null,
      });
      instant += 299_999;
      await reader();
      expect(request).toHaveBeenCalledTimes(1);
      instant += 1;
      request.mockImplementation(async () => {
        return _response();
      });
      expect((await reader()).status).toBe("update_available");
      expect(request).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    { tag_name: "v1.0.0-beta.1", draft: false, prerelease: true },
    { tag_name: "v2.0.0", draft: true, prerelease: false },
    { tag_name: "v01.2.3", draft: false, prerelease: false },
    { tag_name: "garbage", draft: false, prerelease: false },
    {},
  ])(
    "does not claim to be up to date for unsupported metadata %j",
    async (body) => {
      const reader = makeReleaseStatusReaderFromDependencies({
        currentVersion: "1.0.0",
        request: async () => {
          return Response.json(body);
        },
      });
      expect((await reader()).status).toBe("unavailable");
    },
  );

  it("does not reuse an expired success when the next check fails", async () => {
    let instant = new Date(NOW).getTime();
    const request = vi.fn(async () => {
      return _response();
    });
    const reader = makeReleaseStatusReaderFromDependencies({
      currentVersion: "1.10.0",
      request,
      clock: () => {
        return new Date(instant);
      },
    });
    expect((await reader()).status).toBe("up_to_date");
    instant += 3_600_000;
    request.mockRejectedValue(new Error("Network unavailable"));
    expect(await reader()).toEqual({
      status: "unavailable",
      latestVersion: null,
      checkedAt: null,
    });
  });
});
