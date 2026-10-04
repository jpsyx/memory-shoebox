import type { CreateMilestoneBody } from "./milestoneHelpers.types";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { getRecordedRequests, stubFetch } from "@/testing/fetchStubHelpers";
import { makeUploadMilestoneDetail } from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createMilestone, updateMilestone } from "./milestoneHelpers";
import { milestonesQueryOptions } from "./milestonesQueryHelpers";

const BODY: CreateMilestoneBody = {
  name: "Home",
  startsOn: "2026-09-17",
  endsOn: "2026-09-17",
  blurb: null,
};

describe("upload milestone contract", () => {
  it("follows list cursors and returns the complete directory", async () => {
    const detail = makeUploadMilestoneDetail();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ milestones: [detail], nextCursor: "day/id +" }),
      )
      .mockResolvedValueOnce(
        Response.json({
          milestones: [
            {
              ...detail,
              milestone: {
                ...detail.milestone,
                milestoneId: "018f0000-0000-7000-8000-000000008001",
              },
            },
          ],
          nextCursor: null,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const directory = await new QueryClient().fetchQuery(
      milestonesQueryOptions(),
    );
    expect(directory.milestones).toHaveLength(2);
    expect(directory.nextCursor).toBeNull();
    expect(
      fetchMock.mock.calls.map(([url]) => {
        return url;
      }),
    ).toEqual(["/api/milestones", "/api/milestones?cursor=day%2Fid+%2B"]);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      credentials: "same-origin",
    });
  });
  it("creates an occasion without treating manifest files as item ids", async () => {
    stubFetch({
      "POST /api/milestones": {
        status: 201,
        body: makeUploadMilestoneDetail(),
      },
    });
    expect((await createMilestone(BODY)).milestone.name).toBe(
      "Home from the hospital",
    );
    expect(getRecordedRequests()).toEqual([
      { method: "POST", url: "/api/milestones", body: BODY },
    ]);
  });
  it("encodes the milestone address when widening", async () => {
    stubFetch({
      "PATCH /api/milestones/a%2Fb%20%3F": {
        status: 200,
        body: makeUploadMilestoneDetail(),
      },
    });
    await updateMilestone({
      milestoneId: "a/b ?",
      body: { startsOn: "2026-09-15", endsOn: "2026-09-17" },
    });
    expect(getRecordedRequests()[0]).toEqual({
      method: "PATCH",
      url: "/api/milestones/a%2Fb%20%3F",
      body: { startsOn: "2026-09-15", endsOn: "2026-09-17" },
    });
  });
  it.each(["list", "create", "patch"])(
    "rejects malformed %s responses",
    async (operation) => {
      stubFetch({
        "GET /api/milestones": {
          status: 200,
          body: {
            milestones: [{ milestone: makeUploadMilestoneDetail().milestone }],
            nextCursor: null,
          },
        },
        "POST /api/milestones": { status: 201, body: {} },
        "PATCH /api/milestones/id": { status: 200, body: {} },
      });
      const request =
        operation === "list"
          ? new QueryClient({
              defaultOptions: { queries: { retry: false } },
            }).fetchQuery(milestonesQueryOptions())
          : operation === "create"
            ? createMilestone(BODY)
            : updateMilestone({ milestoneId: "id", body: { name: "Home" } });
      await expect(request).rejects.toMatchObject({ name: "ZodError" });
    },
  );
  it("preserves structured API errors", async () => {
    stubFetch({
      "POST /api/milestones": {
        status: 403,
        body: { error: "milestone_forbidden", message: "Forbidden" },
      },
    });
    await expect(createMilestone(BODY)).rejects.toBeInstanceOf(ApiRequestError);
    await expect(createMilestone(BODY)).rejects.toMatchObject({
      status: 403,
      code: "milestone_forbidden",
    });
  });
});
