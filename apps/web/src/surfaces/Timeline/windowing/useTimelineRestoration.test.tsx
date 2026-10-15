import { MantineProvider } from "@mantine/core";
import { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  createMediaLoadingLifetime,
  createMediaLoadingResources,
} from "@/media/createMediaLoadingResources";
import { MediaLoadingContext } from "@/media/MediaLoadingContext";
import { makeBurstFrame } from "@/testing/itemFixtureHelpers";
import { DayStream } from "../DayStream";
import { makeBurst, makeDay, makeItem } from "../timelineFixtures";
import { useBurstFan } from "../TimelineSurface/useBurstFan/useBurstFan";

const burst = makeBurst();
const frame = makeBurstFrame(1);
const day = makeDay({ items: [makeItem({ burst })] });
const saved = {
  capturedOn: day.capturedOn,
  itemId: frame.itemId,
  burstId: burst.burstId,
  offsetPx: 119,
  pageCursor: null,
};
const disposals: Array<() => void> = [];
afterEach(() => {
  disposals.splice(0).forEach((dispose) => {
    dispose();
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mountConsumer() {
  const resources = createMediaLoadingResources({
    memberId: "member",
    lifetime: createMediaLoadingLifetime(),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  resources.timeline.get("view").anchor = saved;
  resources.timeline.expand("view", burst.burstId, 900);
  const reads: Array<(response: Response) => void> = [];
  const fetcher = vi.fn(() => {
    return new Promise<Response>((fulfill) => {
      reads.push(fulfill);
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  function Consumer({ viewKey }: { viewKey: string }) {
    const fan = useBurstFan(client, {
      viewKey,
      memory: resources.timeline,
      retainedBurstIds: new Set([burst.burstId]),
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
  const answer = async (index: number, status = 200, frames = [frame]) => {
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
  const consumer = mountConsumer();
  expect(consumer.fetcher).toHaveBeenCalledOnce();
  fireEvent.scroll(window);
  expect(consumer.resources.timeline.get("view").anchor).toEqual(saved);
  expect(
    consumer.container.querySelector(`[data-item-id="${frame.itemId}"]`),
  ).toBeNull();
  await consumer.answer(0);
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
  const consumer = mountConsumer();
  await consumer.answer(0, 503);
  const retry = await consumer.findByRole("button", {
    name: "Retry returning to your place",
  });
  fireEvent.scroll(window);
  expect(consumer.resources.timeline.get("view").anchor).toEqual(saved);
  fireEvent.click(retry);
  expect(consumer.fetcher).toHaveBeenCalledTimes(2);
  await consumer.answer(1);
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
    const consumer = mountConsumer();
    await consumer.answer(0, status, []);
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
    const consumer = mountConsumer();
    expect(consumer.fetcher).toHaveBeenCalledOnce();
    if (departure === "view") consumer.changeView();
    else consumer.unmount();
    consumer.scroll.mockClear();
    await consumer.answer(0);
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
  const consumer = mountConsumer();
  await consumer.answer(0, 503);
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
  await consumer.answer(1);
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
  const consumer = mountConsumer();
  await consumer.answer(0, 503);
  await consumer.findByRole("button", {
    name: "Retry returning to your place",
  });
  consumer.unmount();
  expect(consumer.resources.timeline.get("view").anchor).toEqual(saved);
});
