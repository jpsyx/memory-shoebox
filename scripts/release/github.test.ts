import { describe, expect, it } from "vitest";
import { makeGitHubPublisherFromConfig } from "./github";

describe("GitHub API publication boundary", () => {
  it("recognizes only 404 as missing, preserving authorization failures", async () => {
    const missing = makeGitHubPublisherFromConfig({
      repository: "owner/project",
      token: "test",
      request: async () => {
        return new Response("", { status: 404 });
      },
    });
    expect(await missing.hasRelease("v1.0.0")).toBe(false);
    const denied = makeGitHubPublisherFromConfig({
      repository: "owner/project",
      token: "test",
      request: async () => {
        return new Response("", { status: 403 });
      },
    });
    await expect(denied.hasRelease("v1.0.0")).rejects.toThrow(/403/);
  });

  it("targets an existing exact tag and sends commit notes as data", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const github = makeGitHubPublisherFromConfig({
      repository: "owner/project",
      token: "test",
      request: async (url, init) => {
        requests.push({
          url: String(url),
          body: JSON.parse(String(init?.body)),
        });
        return new Response("{}", { status: 201 });
      },
    });
    await github.publish({
      tag: "v1.0.0",
      commit: "a".repeat(40),
      notes: "- feat: `$(touch nope)`",
    });
    expect(requests).toEqual([
      {
        url: "https://api.github.com/repos/owner/project/releases",
        body: {
          tag_name: "v1.0.0",
          target_commitish: "a".repeat(40),
          name: "v1.0.0",
          body: "- feat: `$(touch nope)`",
          draft: false,
          prerelease: false,
        },
      },
    ]);
  });

  it("propagates publication failures so a later run repairs the tag", async () => {
    const github = makeGitHubPublisherFromConfig({
      repository: "owner/project",
      token: "test",
      request: async () => {
        return new Response("", { status: 500 });
      },
    });
    await expect(
      github.publish({ tag: "v1.0.0", commit: "a".repeat(40), notes: "notes" }),
    ).rejects.toThrow(/500/);
  });
});
