import type { ResolveVisibilityRuleRequest } from "@memory-shoebox/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findOrCreateVisibilityRule } from "@/api/visibilityRules/visibilityRules";

/** One request as the server saw it. */
type Call = { url: string; method: string; body: unknown };

const calls: Call[] = [];

/** Answers every request with one body, and records what was asked. */
function _answerWith(body: unknown, status = 200): void {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body:
          init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("findOrCreateVisibilityRule", () => {
  it("posts the mode and the subjects and reads the rule back", async () => {
    const answer = {
      visibilityRuleId: "018f0000-0000-7000-8000-0000000a0001",
      visibility: {
        visibilityRuleId: "018f0000-0000-7000-8000-0000000a0001",
        mode: "only",
        label: "Just us two",
        subjects: [
          {
            kind: "member",
            id: "018f0000-0000-7000-8000-000000000000",
            displayName: "Papá",
          },
        ],
      },
    };
    const request: ResolveVisibilityRuleRequest = {
      mode: "only",
      subjects: [
        { kind: "member", id: "018f0000-0000-7000-8000-000000000000" },
      ],
    };
    _answerWith(answer);

    await expect(findOrCreateVisibilityRule(request)).resolves.toEqual(answer);
    expect(calls).toEqual([
      {
        url: "/api/visibility-rules/resolve",
        method: "POST",
        body: request,
      },
    ]);
  });
});
