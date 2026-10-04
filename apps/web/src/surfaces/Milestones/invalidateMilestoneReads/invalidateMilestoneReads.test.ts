import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { invalidateMilestoneReads } from "./invalidateMilestoneReads";
describe("occasion invalidation", () => {
  it("refetches active member reads but only marks item details stale", async () => {
    const queryClient = new QueryClient();
    const itemQueryFn = vi.fn(async () => {
      return { photo: true };
    });
    queryClient.setQueryData(["items", "i1"], { photo: true });
    const item = new QueryObserver(queryClient, {
      queryKey: ["items", "i1"],
      queryFn: itemQueryFn,
      staleTime: Infinity,
    });
    const unsubscribeItem = item.subscribe(() => {});
    const reads = ["directory", "detail", "candidates", "mismatches"].map(
      (kind) => {
        const queryKey = ["milestones", kind, "member", "/milestones/m1"];
        queryClient.setQueryData(queryKey, { old: true });
        const queryFn = vi.fn(async () => {
          return { fresh: true };
        });
        const observer = new QueryObserver(queryClient, {
          queryKey,
          queryFn,
          staleTime: Infinity,
        });
        return { queryFn, unsubscribe: observer.subscribe(() => {}) };
      },
    );
    queryClient.setQueryData(["timeline", "rail"], {});
    queryClient.setQueryData(["bursts", "b1", "frames"], {});
    await invalidateMilestoneReads({
      queryClient,
      milestoneId: "m1",
      itemIds: ["i1"],
      hasMovedItems: true,
    });
    reads.forEach((read) => {
      expect(read.queryFn).toHaveBeenCalledTimes(1);
      read.unsubscribe();
    });
    expect(itemQueryFn).not.toHaveBeenCalled();
    expect(queryClient.getQueryState(["items", "i1"])?.isInvalidated).toBe(
      true,
    );
    expect(queryClient.getQueryState(["timeline", "rail"])?.isInvalidated).toBe(
      true,
    );
    expect(
      queryClient.getQueryState(["bursts", "b1", "frames"])?.isInvalidated,
    ).toBe(true);
    unsubscribeItem();
    queryClient.clear();
  });
  it("label deletion retains cached items and burst media", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["items", "i1"], { photo: true });
    queryClient.setQueryData(["bursts", "b1", "frames"], { photo: true });
    await invalidateMilestoneReads({ queryClient, milestoneId: "m1" });
    expect(queryClient.getQueryState(["items", "i1"])?.isInvalidated).toBe(
      false,
    );
    expect(queryClient.getQueryData(["items", "i1"])).toEqual({ photo: true });
    expect(
      queryClient.getQueryState(["bursts", "b1", "frames"])?.isInvalidated,
    ).toBe(false);
  });
});
