import { afterEach, describe, expect, it, vi } from "vitest";
import { groupsQueryOptions } from "@/api/groups/groups";
import { callQueryFn } from "@/testing/callQueryFn";
import { stubFetch } from "@/testing/fetchStubHelpers";

/** Answers the one route this module reads. */
function _answerWith(body: unknown): void {
  stubFetch({ "GET /api/groups": { body, status: 200 } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const GRANDPARENTS = {
  groupId: "018f0000-0000-7000-8000-0000000a0001",
  name: "The grandparents",
};

describe("groupsQueryOptions", () => {
  it("reads the picker shape an uploader gets", async () => {
    _answerWith({ shape: "picker", groups: [GRANDPARENTS], nextCursor: null });

    await expect(callQueryFn(groupsQueryOptions())).resolves.toEqual({
      shape: "picker",
      groups: [GRANDPARENTS],
      nextCursor: null,
    });
  });

  it("keeps an admin's member list and drops the usage counts", async () => {
    const papa = {
      memberId: "018f0000-0000-7000-8000-000000000000",
      displayName: "Papá",
    };
    _answerWith({
      shape: "admin",
      groups: [
        {
          ...GRANDPARENTS,
          createdAt: "2026-09-01T10:00:00.000Z",
          members: [papa],
          usedByOnlyRules: 9,
          usedByExceptRules: 0,
        },
      ],
      nextCursor: null,
    });

    await expect(callQueryFn(groupsQueryOptions())).resolves.toEqual({
      shape: "admin",
      groups: [{ ...GRANDPARENTS, members: [papa] }],
      nextCursor: null,
    });
  });
});
