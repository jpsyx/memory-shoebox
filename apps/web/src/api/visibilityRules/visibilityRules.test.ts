import type { ResolveVisibilityRuleRequest } from "@memory-shoebox/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findOrCreateVisibilityRule } from "@/api/visibilityRules/visibilityRules";
import { getRecordedRequests, stubFetch } from "@/testing/fetchStub";

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
    stubFetch({
      "POST /api/visibility-rules/resolve": { body: answer, status: 200 },
    });

    await expect(findOrCreateVisibilityRule(request)).resolves.toEqual(answer);
    expect(getRecordedRequests()).toEqual([
      {
        url: "/api/visibility-rules/resolve",
        method: "POST",
        body: request,
      },
    ]);
  });
});
