import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { markPileStale } from "@/surfaces/Item/itemWrites/itemWriteHelpers/itemWriteHelpers";
import { BURST_ID, ITEM_ID } from "@/testing/itemFixtureHelpers";

describe("marking the pile stale", () => {
  it("marks exactly the pile's five prefixes stale and refetches nothing", () => {
    const queryClient = new QueryClient();
    const queryFn = vi.fn(async () => {
      return "fresh";
    });
    const pileKeys = [
      ["timeline", "q=1"],
      ["timeline", "rail", "q=1"],
      ["filters", "facets", ""],
      ["tags", ""],
      ["people", ""],
      ["bursts", BURST_ID, "frames"],
    ];
    const otherKeys = [
      ["items", ITEM_ID],
      ["me"],
      ["members", "picker"],
      ["groups", "picker"],
    ];
    // Every one is observed, so a refetch of any of them would be sent.
    const unsubscribes = [...pileKeys, ...otherKeys].map((queryKey) => {
      queryClient.setQueryData(queryKey, "cached");
      const observer = new QueryObserver(queryClient, {
        queryKey,
        queryFn,
        staleTime: Infinity,
      });
      return observer.subscribe(() => {});
    });

    markPileStale(queryClient);

    const staleKeys = [...pileKeys, ...otherKeys].filter((queryKey) => {
      return queryClient.getQueryState(queryKey)?.isInvalidated === true;
    });
    expect(staleKeys).toEqual(pileKeys);
    expect(queryFn).not.toHaveBeenCalled();
    unsubscribes.forEach((unsubscribe) => {
      unsubscribe();
    });
  });
});
