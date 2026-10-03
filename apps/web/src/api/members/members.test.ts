import { afterEach, describe, expect, it, vi } from "vitest";
import { membersQueryOptions } from "@/api/members/members";
import { callQueryFn } from "@/testing/callQueryFn";
import { stubFetch } from "@/testing/fetchStub";

/** Answers the one route this module reads. */
function _answerWith(body: unknown): void {
  stubFetch({ "GET /api/members": { body, status: 200 } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const PAPA = {
  memberId: "018f0000-0000-7000-8000-000000000000",
  displayName: "Papá",
};

describe("membersQueryOptions", () => {
  it("reads the directory shape an uploader gets", async () => {
    _answerWith({ shape: "directory", members: [PAPA], nextCursor: null });

    await expect(callQueryFn(membersQueryOptions())).resolves.toEqual({
      shape: "directory",
      members: [PAPA],
      nextCursor: null,
    });
  });

  it("reads an admin's rows down to what the picker needs", async () => {
    _answerWith({
      shape: "admin",
      members: [
        {
          ...PAPA,
          email: "papa@example.com",
          role: "admin",
          status: "active",
          sessions: [],
          invitation: null,
        },
      ],
      nextCursor: null,
      activeAdminCount: 1,
    });

    await expect(callQueryFn(membersQueryOptions())).resolves.toEqual({
      shape: "admin",
      members: [{ ...PAPA, role: "admin" }],
      nextCursor: null,
    });
  });
});
