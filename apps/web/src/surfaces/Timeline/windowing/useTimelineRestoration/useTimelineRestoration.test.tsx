import type { BurstFrameRef } from "@memory-shoebox/shared";
import type { TimelineAnchor } from "../timelineWindow.types";
import { createMediaLoadingResources } from "@/media/createMediaLoadingResources/createMediaLoadingResources";
import { createMediaLoadingLifetime } from "@/media/createMediaLoadingResources/createMediaLoadingLifetime";
import { MediaLoadingContext } from "@/media/MediaLoadingContext";
import { makeBurstFrameFromPosition } from "@/testing/itemFixtureHelpers";
import { MantineProvider } from "@mantine/core";
import { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DayStream } from "../../DayStream/DayStream";
import { makeBurst, makeDay, makeItem } from "../../timelineFixtureHelpers";
import { useBurstFan } from "../../TimelineSurface/useBurstFan/useBurstFan";

import type { ReactNode } from "react";
import type { MockInstance } from "vitest";

type Props = { viewKey: string };

type MountedConsumer = ReturnType<typeof render> & {
  resources: ReturnType<typeof createMediaLoadingResources>;
  client: QueryClient;
  fetcher: ReturnType<typeof vi.fn<() => Promise<Response>>>;
  scroll: MockInstance<Window["scrollTo"]>;
  answer: (
    options: Readonly<{
      index: number;
      status?: number;
      frames?: readonly BurstFrameRef[];
    }>,
  ) => Promise<void>;
  changeView: () => void;
};

const burst = makeBurst();
const frame = makeBurstFrameFromPosition(1);
const day = makeDay({ items: [makeItem({ burst })] });
const saved = {
  capturedOn: day.capturedOn,
  itemId: frame.itemId,
  burstId: burst.burstId,
  offsetPx: 119,
  pageCursor: undefined,
} satisfies TimelineAnchor;
const disposals: Array<() => void> = [];
afterEach(() => {
  disposals.splice(0).forEach((dispose) => {
    dispose();
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function _mountConsumer(): MountedConsumer {
  const resources = createMediaLoadingResources({
    memberId: "member",
    lifetime: createMediaLoadingLifetime(),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  resources.timeline.get("view").anchor = saved;
  resources.timeline.expand({
    viewKey: "view",
    burstId: burst.burstId,
    height: 900,
  });
  const reads: Array<(response: Response) => void> = [];
  const fetcher = vi.fn(() => {
    return new Promise<Response>((fulfill) => {
      reads.push(fulfill);
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  function Consumer({ viewKey }: Readonly<Props>): ReactNode {
    const fan = useBurstFan({
      queryClient: client,
      options: {
        viewKey,
        memory: resources.timeline,
        retainedBurstIds: new Set([burst.burstId]),
      },
    });
    return (
      <MantineProvider>
        <MediaLoadingContext value={resources}>
          <DayStream
            key={viewKey}
            days={[day]}
            countLabel={undefined}
            {...fan}
            onOpenItem={() => {}}
            onReachEnd={() => {}}
            hasMore={false}
            viewKey={viewKey}
          />
        </MediaLoadingContext>
      </MantineProvider>
    );
  }
  const result = render(<Consumer viewKey="view" />);
  disposals.push(() => {
    result.unmount();
    client.clear();
    resources.dispose();
  });
  const answer = async ({
    index,
    status = 200,
    frames = [frame],
  }: Readonly<{
    index: number;
    status?: number;
    frames?: readonly BurstFrameRef[];
  }>) => {
    await act(async () => {
      reads[index]!(
        new Response(JSON.stringify({ frames, nextCursor: null }), { status }),
      );
    });
  };
  return {
    ...result,
    resources,
    client,
    fetcher,
    scroll,
    answer,
    changeView: () => {
      result.rerender(<Consumer viewKey="other" />);
    },
  };
}

it("awaits a real shared frame query and protects the saved position through pending scrolls", async () => {
  const consumer = _mountConsumer();
  expect(consumer.fetcher).toHaveBeenCalledOnce();
  fireEvent.scroll(window);
  expect(consumer.resources.timeline.get("view").anchor).toEqual(saved);
  expect(
    consumer.container.querySelector(`[data-item-id="${frame.itemId}"]`),
  ).toBeNull();
  await consumer.answer({ index: 0 });
  await waitFor(() => {
    expect(
      consumer.container.querySelector(`[data-item-id="${frame.itemId}"]`),
    ).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(consumer.scroll).toHaveBeenCalled();
  });
  expect(consumer.fetcher).toHaveBeenCalledOnce();
});

it("keeps the requested anchor after transport failure and a reachable Retry restores it", async () => {
  const consumer = _mountConsumer();
  await consumer.answer({ index: 0, status: 503 });
  const retry = await consumer.findByRole("button", {
    name: "Retry returning to your place",
  });
  fireEvent.scroll(window);
  expect(consumer.resources.timeline.get("view").anchor).toEqual(saved);
  fireEvent.click(retry);
  expect(consumer.fetcher).toHaveBeenCalledTimes(2);
  await consumer.answer({ index: 1 });
  await waitFor(() => {
    expect(
      consumer.queryByRole("button", { name: "Retry returning to your place" }),
    ).toBeNull();
  });
  expect(
    consumer.container.querySelector(`[data-item-id="${frame.itemId}"]`),
  ).toBeInTheDocument();
});

it.each([200, 404])(
  "finishes authoritative frame absence (%i) at the retained day without retry",
  async (status) => {
    const consumer = _mountConsumer();
    await consumer.answer({ index: 0, status: status, frames: [] });
    await waitFor(() => {
      expect(consumer.scroll).toHaveBeenCalled();
    });
    expect(
      consumer.queryByRole("button", { name: "Retry returning to your place" }),
    ).toBeNull();
    fireEvent.scroll(window);
    expect(consumer.resources.timeline.get("view").anchor).not.toEqual(saved);
  },
);

it.each(["view", "unmount"])(
  "retires a delayed restoration on %s departure without overwriting its saved anchor",
  async (departure) => {
    const consumer = _mountConsumer();
    expect(consumer.fetcher).toHaveBeenCalledOnce();
    if (departure === "view") {
      consumer.changeView();
    } else {
      consumer.unmount();
    }
    consumer.scroll.mockClear();
    await consumer.answer({ index: 0 });
    expect(consumer.scroll).not.toHaveBeenCalled();
    expect(consumer.resources.timeline.get("view").anchor).toEqual(saved);
    expect(
      consumer.client.getQueryData(["bursts", burst.burstId, "frames"]),
    ).toBeUndefined();
    expect(
      consumer.container.querySelector(`[data-item-id="${frame.itemId}"]`),
    ).toBeNull();
  },
);

it("supersedes a pending Retry while reusing its query and only completing the current restore", async () => {
  const consumer = _mountConsumer();
  await consumer.answer({ index: 0, status: 503 });
  const retry = await consumer.findByRole("button", {
    name: "Retry returning to your place",
  });
  fireEvent.click(retry);
  fireEvent.click(retry);
  expect(consumer.fetcher).toHaveBeenCalledTimes(2);
  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.scroll(window);
  expect(consumer.resources.timeline.get("view").anchor).toEqual(saved);
  expect(retry).toBeInTheDocument();
  await consumer.answer({ index: 1 });
  await waitFor(() => {
    expect(
      consumer.queryByRole("button", { name: "Retry returning to your place" }),
    ).toBeNull();
  });
  expect(
    consumer.container.querySelector(`[data-item-id="${frame.itemId}"]`),
  ).toBeInTheDocument();
});

it("preserves the requested position when leaving after a transport error", async () => {
  const consumer = _mountConsumer();
  await consumer.answer({ index: 0, status: 503 });
  await consumer.findByRole("button", {
    name: "Retry returning to your place",
  });
  consumer.unmount();
  expect(consumer.resources.timeline.get("view").anchor).toEqual(saved);
});
