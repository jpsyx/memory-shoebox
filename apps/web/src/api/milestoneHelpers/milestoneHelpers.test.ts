import type { CreateMilestoneBody } from "./milestoneHelpers.types";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { getRecordedRequests, stubFetch } from "@/testing/fetchStubHelpers";
import { makeUploadMilestoneDetail } from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  createMilestone,
  updateMilestone,
  deleteMilestone,
} from "./milestoneHelpers";
import {
  milestonesQueryOptions,
  milestoneDetailQueryOptions,
  milestonesInfiniteQueryOptions,
} from "./milestonesQueryHelpers";

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

describe("occasion route contracts", () => {
  it("accepts a 200-character name and rejects 201 before sending", async () => {
    stubFetch({
      "POST /api/milestones": {
        status: 201,
        body: makeUploadMilestoneDetail(),
      },
    });
    await createMilestone({ ...BODY, name: "a".repeat(200) });
    expect(getRecordedRequests()[0]?.body).toMatchObject({
      name: "a".repeat(200),
    });
    expect(() => {
      return createMilestone({ ...BODY, name: "a".repeat(201) });
    }).toThrowError(/Too big/);
    expect(getRecordedRequests()).toHaveLength(1);
  });
  it("accepts landed selections while preserving pre-ingest calls", async () => {
    stubFetch({
      "POST /api/milestones": {
        status: 201,
        body: makeUploadMilestoneDetail(),
      },
    });
    await createMilestone({
      ...BODY,
      itemIds: ["018f0000-0000-7000-8000-00000000f001"],
      blurb: " ",
    });
    expect(getRecordedRequests()[0]?.body).toEqual({
      ...BODY,
      itemIds: ["018f0000-0000-7000-8000-00000000f001"],
      blurb: null,
    });
  });
  it("uses the shared update name limit", async () => {
    stubFetch({
      "PATCH /api/milestones/id": {
        status: 200,
        body: makeUploadMilestoneDetail(),
      },
    });
    await updateMilestone({
      milestoneId: "id",
      body: { name: "a".repeat(200) },
    });
    expect(() => {
      return updateMilestone({
        milestoneId: "id",
        body: { name: "a".repeat(201) },
      });
    }).toThrowError(/Too big/);
  });
});

describe("occasion member-scoped reads and deletion", () => {
  it("reads detail at an encoded path with an abort signal", async () => {
    stubFetch({
      "GET /api/milestones/a%2Fb%20%3F": {
        status: 200,
        body: makeUploadMilestoneDetail(),
      },
    });
    const detail = await new QueryClient().fetchQuery(
      milestoneDetailQueryOptions({ memberId: "one", milestoneId: "a/b ?" }),
    );
    expect(detail.milestone.name).toBe("Home from the hospital");
    expect(getRecordedRequests()).toEqual([
      { method: "GET", url: "/api/milestones/a%2Fb%20%3F", body: undefined },
    ]);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.signal).toBeInstanceOf(
      AbortSignal,
    );
  });
  it("parses milestone deletion's 200 response without a request body", async () => {
    const response = {
      milestoneId: "018f0000-0000-7000-8000-000000008001",
      name: "Home",
      detachedItemCount: 3,
    };
    stubFetch({
      "DELETE /api/milestones/a%2Fb%20%3F": { status: 200, body: response },
    });
    await expect(deleteMilestone("a/b ?")).resolves.toEqual(response);
    expect(getRecordedRequests()).toEqual([
      { method: "DELETE", url: "/api/milestones/a%2Fb%20%3F", body: undefined },
    ]);
  });
  it("separates member, detail and complete-directory cache identities", () => {
    const detail = milestoneDetailQueryOptions({
      memberId: "one",
      milestoneId: "id",
    }).queryKey;
    expect(detail).not.toEqual(
      milestoneDetailQueryOptions({ memberId: "two", milestoneId: "id" })
        .queryKey,
    );
    expect(detail).not.toEqual(
      milestoneDetailQueryOptions({ memberId: "one", milestoneId: "other" })
        .queryKey,
    );
    const directory = milestonesInfiniteQueryOptions("one").queryKey;
    expect(directory).not.toEqual(
      milestonesInfiniteQueryOptions("two").queryKey,
    );
    expect(directory).not.toEqual(milestonesQueryOptions().queryKey);
  });
  it("pages the directory using opaque cursors, including empty pages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ milestones: [], nextCursor: "day/id +" }),
      )
      .mockResolvedValueOnce(
        Response.json({
          milestones: [makeUploadMilestoneDetail()],
          nextCursor: null,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const options = milestonesInfiniteQueryOptions("one");
    const result = await new QueryClient().fetchInfiniteQuery({
      ...options,
      pages: 3,
    });
    expect(result.pages).toHaveLength(2);
    expect(
      fetchMock.mock.calls.map(([url]) => {
        return url;
      }),
    ).toEqual(["/api/milestones", "/api/milestones?cursor=day%2Fid+%2B"]);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it.each(["detail", "delete", "directory"] as const)(
    "rejects malformed %s responses",
    async (operation) => {
      stubFetch({
        "GET /api/milestones/id": { status: 200, body: {} },
        "DELETE /api/milestones/id": { status: 200, body: {} },
        "GET /api/milestones": { status: 200, body: {} },
      });
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const operations = {
        detail: () => {
          return client.fetchQuery(
            milestoneDetailQueryOptions({ memberId: "one", milestoneId: "id" }),
          );
        },
        delete: () => {
          return deleteMilestone("id");
        },
        directory: () => {
          return client.fetchInfiniteQuery(
            milestonesInfiniteQueryOptions("one"),
          );
        },
      };
      await expect(operations[operation]()).rejects.toMatchObject({
        name: "ZodError",
      });
    },
  );
});
