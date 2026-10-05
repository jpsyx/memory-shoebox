import {
  makeItemSummaryFromOverrides,
  makeMilestoneDetailFromOverrides,
} from "@/testing/askingAndOccasionsFixtureHelpers";
import { getRecordedRequests, stubFetch } from "@/testing/fetchStubHelpers";
import type {
  ItemSummary,
  ListMilestoneCandidatesResponse,
  ListMilestoneMismatchesResponse,
  MilestoneDetail,
} from "@memory-shoebox/shared";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  makeMilestoneCandidatesInfiniteQueryOptionsFromIdentity,
  makeMilestoneMismatchesInfiniteQueryOptionsFromIdentity,
} from "../milestoneItemsQueryHelpers";
import { reconcileMilestone, setMilestoneItems } from "./milestoneItemsHelpers";
const DETAIL = makeMilestoneDetailFromOverrides() satisfies MilestoneDetail;
const ITEM = makeItemSummaryFromOverrides() satisfies ItemSummary;
const CANDIDATES = {
  candidates: [{ item: ITEM, isAttached: false, isOutsideSpan: false }],
  nextCursor: null,
} satisfies ListMilestoneCandidatesResponse;
const MISMATCHES = {
  mismatches: [{ item: ITEM, attachedAt: "2026-10-04T12:00:00.000Z" }],
  nextCursor: null,
  milestone: DETAIL.milestone,
  wideningSpan: { startsOn: "2026-09-14", endsOn: "2026-09-15" },
} satisfies ListMilestoneMismatchesResponse;

function _makeClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("occasion attachments and reconciliation", () => {
  it("sends only the explicit attachment delta and returns server counts", async () => {
    stubFetch({
      "PATCH /api/milestones/a%2Fb%20%3F/items": {
        status: 200,
        body: { ...DETAIL, attachedCount: 1, detachedCount: 0 },
      },
    });
    await expect(
      setMilestoneItems({
        milestoneId: "a/b ?",
        body: { attach: [ITEM.itemId], detach: [] },
      }),
    ).resolves.toMatchObject({ attachedCount: 1 });
    const requests = getRecordedRequests();
    expect(requests[0]?.url).toBe("/api/milestones/a%2Fb%20%3F/items");
    expect(
      requests.find(({ method }) => {
        return method === "PATCH";
      })?.body,
    ).toEqual({
      attach: [ITEM.itemId],
      detach: [],
    });
  });
  it.each([
    { mode: "move", moves: [{ itemId: ITEM.itemId, targetOn: "2026-09-14" }] },
    { mode: "acknowledge", itemIds: [ITEM.itemId] },
  ] as const)("posts $mode reconciliation", async (body) => {
    stubFetch({
      "POST /api/milestones/a%2Fb%20%3F/reconcile": {
        status: 200,
        body: {
          ...DETAIL,
          movedCount: 1,
          acknowledgedCount: 0,
          raisedElsewhere: [],
        },
      },
    });
    const writableBody =
      body.mode === "move"
        ? { mode: body.mode, moves: [...body.moves] }
        : { mode: body.mode, itemIds: [...body.itemIds] };
    await expect(
      reconcileMilestone({ milestoneId: "a/b ?", body: writableBody }),
    ).resolves.toMatchObject({ movedCount: 1 });
    expect(getRecordedRequests()).toEqual([
      { method: "POST", url: "/api/milestones/a%2Fb%20%3F/reconcile", body },
    ]);
  });
  it("rejects empty, overlapping, duplicate and oversized attachment batches before fetch", () => {
    stubFetch({});
    const tooMany = Array.from({ length: 501 }, (_unused, index) => {
      return `018f0000-0000-7000-8000-${String(index).padStart(12, "0")}`;
    });
    [
      { attach: [], detach: [] },
      { attach: [ITEM.itemId], detach: [ITEM.itemId] },
      { attach: [ITEM.itemId, ITEM.itemId], detach: [] },
      { attach: tooMany, detach: [] },
    ].forEach((body) => {
      expect(() => {
        return setMilestoneItems({ milestoneId: "id", body });
      }).toThrow();
    });
    expect(() => {
      return reconcileMilestone({
        milestoneId: "id",
        body: { mode: "acknowledge", itemIds: tooMany },
      });
    }).toThrow();
    expect(getRecordedRequests()).toEqual([]);
  });
  it.each(["candidates", "mismatches"] as const)(
    "reads %s at the encoded path with an abort signal",
    async (branch) => {
      stubFetch({
        [`GET /api/milestones/a%2Fb%20%3F/${branch}`]: {
          status: 200,
          body: branch === "candidates" ? CANDIDATES : MISMATCHES,
        },
      });
      const OPTIONS = { memberId: "one", milestoneId: "a/b ?" };
      if (branch === "candidates") {
        expect(
          (
            await _makeClient().fetchInfiniteQuery(
              makeMilestoneCandidatesInfiniteQueryOptionsFromIdentity(OPTIONS),
            )
          ).pages[0],
        ).toEqual(CANDIDATES);
      } else {
        expect(
          (
            await _makeClient().fetchInfiniteQuery(
              makeMilestoneMismatchesInfiniteQueryOptionsFromIdentity(OPTIONS),
            )
          ).pages[0],
        ).toEqual(MISMATCHES);
      }
      expect(getRecordedRequests()).toEqual([
        {
          method: "GET",
          url: `/api/milestones/a%2Fb%20%3F/${branch}${branch === "candidates" ? "?scope=span" : ""}`,
          body: undefined,
        },
      ]);
      expect(vi.mocked(fetch).mock.calls[0]?.[1]?.signal).toBeInstanceOf(
        AbortSignal,
      );
    },
  );
  it("separates attachment branches, members and occasions", () => {
    const OPTIONS = { memberId: "one", milestoneId: "id" } as const;
    const candidates =
      makeMilestoneCandidatesInfiniteQueryOptionsFromIdentity(OPTIONS).queryKey;
    expect(candidates).not.toEqual(
      makeMilestoneMismatchesInfiniteQueryOptionsFromIdentity(OPTIONS).queryKey,
    );
    expect(candidates).not.toEqual(
      makeMilestoneCandidatesInfiniteQueryOptionsFromIdentity({
        ...OPTIONS,
        memberId: "two",
      }).queryKey,
    );
    expect(candidates).not.toEqual(
      makeMilestoneCandidatesInfiniteQueryOptionsFromIdentity({
        ...OPTIONS,
        milestoneId: "other",
      }).queryKey,
    );
    expect(
      makeMilestoneMismatchesInfiniteQueryOptionsFromIdentity(OPTIONS).queryKey,
    ).not.toEqual(
      makeMilestoneMismatchesInfiniteQueryOptionsFromIdentity({
        ...OPTIONS,
        memberId: "two",
      }).queryKey,
    );
  });
  it.each(["candidates", "mismatches"] as const)(
    "continues an empty %s page until a null cursor",
    async (branch) => {
      const page = branch === "candidates" ? CANDIDATES : MISMATCHES;
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ ...page, [branch]: [], nextCursor: "day/id +" }),
        )
        .mockResolvedValueOnce(Response.json(page));
      vi.stubGlobal("fetch", fetchMock);
      const OPTIONS = { memberId: "one", milestoneId: "id" } as const;
      const pages =
        branch === "candidates"
          ? (
              await _makeClient().fetchInfiniteQuery({
                ...makeMilestoneCandidatesInfiniteQueryOptionsFromIdentity(
                  OPTIONS,
                ),
                pages: 3,
              })
            ).pages
          : (
              await _makeClient().fetchInfiniteQuery({
                ...makeMilestoneMismatchesInfiniteQueryOptionsFromIdentity(
                  OPTIONS,
                ),
                pages: 3,
              })
            ).pages;
      expect(pages).toHaveLength(2);
      expect(
        fetchMock.mock.calls.map(([url]) => {
          return url;
        }),
      ).toEqual(
        branch === "candidates"
          ? [
              "/api/milestones/id/candidates?scope=span",
              "/api/milestones/id/candidates?scope=span&cursor=day%2Fid+%2B",
            ]
          : [
              "/api/milestones/id/mismatches",
              "/api/milestones/id/mismatches?cursor=day%2Fid+%2B",
            ],
      );
    },
  );
  it.each(["items", "reconcile", "candidates", "mismatches"] as const)(
    "rejects malformed %s responses",
    async (operation) => {
      stubFetch({
        "PATCH /api/milestones/id/items": { status: 200, body: {} },
        "POST /api/milestones/id/reconcile": { status: 200, body: {} },
        "GET /api/milestones/id/candidates": { status: 200, body: {} },
        "GET /api/milestones/id/mismatches": { status: 200, body: {} },
      });
      const OPTIONS = { memberId: "one", milestoneId: "id" } as const;
      const operations = {
        items: () => {
          return setMilestoneItems({
            milestoneId: "id",
            body: { attach: [ITEM.itemId], detach: [] },
          });
        },
        reconcile: () => {
          return reconcileMilestone({
            milestoneId: "id",
            body: { mode: "acknowledge", itemIds: [ITEM.itemId] },
          });
        },
        candidates: () => {
          return _makeClient().fetchInfiniteQuery(
            makeMilestoneCandidatesInfiniteQueryOptionsFromIdentity(OPTIONS),
          );
        },
        mismatches: () => {
          return _makeClient().fetchInfiniteQuery(
            makeMilestoneMismatchesInfiniteQueryOptionsFromIdentity(OPTIONS),
          );
        },
      };
      await expect(operations[operation]()).rejects.toMatchObject({
        name: "ZodError",
      });
    },
  );
  it("preserves dotted move field errors", async () => {
    stubFetch({
      "POST /api/milestones/id/reconcile": {
        status: 400,
        body: {
          error: "validation_error",
          message: "Outside span",
          details: {
            fieldErrors: { "moves.0.targetOn": ["Choose an occasion day"] },
          },
        },
      },
    });
    await expect(
      reconcileMilestone({
        milestoneId: "id",
        body: {
          mode: "move",
          moves: [{ itemId: ITEM.itemId, targetOn: "2026-09-14" }],
        },
      }),
    ).rejects.toMatchObject({
      details: {
        fieldErrors: { "moves.0.targetOn": ["Choose an occasion day"] },
      },
    });
  });
});
