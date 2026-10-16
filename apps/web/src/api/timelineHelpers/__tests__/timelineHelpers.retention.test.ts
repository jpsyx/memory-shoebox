import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { makeDay } from "@/surfaces/Timeline/timelineFixtureHelpers";
import { makeTimelineQueryOptionsFromView } from "../timelineHelpers";

it("does not retain an evicted page through an older reader's settled fetch signal", async () => {
  setFlagsFromString("--expose_gc");
  const collect = runInNewContext("gc") as () => void;
  const input = {
    memberId: "member",
    view: {
      selection: { tags: [], people: [], from: undefined, until: undefined },
      at: undefined,
    },
  };
  const retainedOptions = makeTimelineQueryOptionsFromView(input);
  const client = new QueryClient();
  let requestCount = 0;
  vi.stubGlobal("fetch", async () => {
    requestCount += 1;
    return Response.json({
      days: [makeDay({ capturedOn: `2026-09-${30 - requestCount}` })],
      nextCursor: `issued-${requestCount}`,
      previousCursor: null,
      resultCount: requestCount === 1 ? 100 : null,
    });
  });
  const observer = new InfiniteQueryObserver(client, retainedOptions);
  try {
    await observer.refetch();
    const evicted = new WeakRef(observer.getCurrentResult().data!.pages[0]!);
    await observer.fetchNextPage();
    observer.setOptions(makeTimelineQueryOptionsFromView(input));
    for (let pageIndex = 0; pageIndex < 8; pageIndex += 1) {
      await observer.fetchNextPage();
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise<void>((done) => {
        setTimeout(done, 0);
      });
      collect();
    }
    expect(observer.getCurrentResult().data!.pages).toHaveLength(5);
    // React may keep old options, but that must not retain the fetch's old
    // pages.
    expect(retainedOptions.queryFn).toBeTypeOf("function");
    expect(evicted.deref()).toBeUndefined();
  } finally {
    observer.destroy();
    client.clear();
    vi.unstubAllGlobals();
  }
});
