import { MantineProvider } from "@mantine/core";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DayStream } from "../DayStream";
import { makeDay, makeItem } from "../timelineFixtures";

it("bounds a 1,000-item atomic day before any page can be evicted", () => {
  const items = Array.from({ length: 1000 }, (_, index) => {
    return makeItem({ itemId: `item-${index}` });
  });
  const { container } = render(
    <MantineProvider>
      <DayStream
        days={[makeDay({ items, itemCount: 1000 })]}
        countLabel={undefined}
        framesByBurstId={new Map()}
        onOpenBurst={() => {}}
        onOpenItem={() => {}}
        onReachEnd={() => {}}
        hasMore={false}
      />
    </MantineProvider>,
  );
  expect(
    container.querySelectorAll('[data-photo-surface="pile"]').length,
  ).toBeGreaterThan(0);
  expect(
    container.querySelectorAll('[data-photo-surface="pile"]').length,
  ).toBeLessThanOrEqual(200);
});

it("keeps committed rows and offers a retry when saved-cursor recovery fails", async () => {
  const { createMediaLoadingResources, createMediaLoadingLifetime } =
    await import("@/media/createMediaLoadingResources");
  const { MediaLoadingContext } = await import("@/media/MediaLoadingContext");
  const resources = createMediaLoadingResources({
    memberId: "member",
    lifetime: createMediaLoadingLifetime(),
  });
  resources.timeline.get("view").anchor = {
    capturedOn: "2026-01-01",
    itemId: "old-item",
    offsetPx: 100,
    pageCursor: "issued",
  };
  const recoverPage = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(undefined);
  const result = render(
    <MantineProvider>
      <MediaLoadingContext value={resources}>
        <DayStream
          days={[makeDay()]}
          countLabel={undefined}
          framesByBurstId={new Map()}
          onOpenBurst={() => {}}
          onOpenItem={() => {}}
          onReachEnd={() => {}}
          hasMore={false}
          viewKey="view"
          recoverPage={recoverPage}
        />
      </MediaLoadingContext>
    </MantineProvider>,
  );
  const retry = await result.findByRole("button", {
    name: "Retry returning to your place",
  });
  expect(
    result.container.querySelector("[data-timeline-pile]"),
  ).toBeInTheDocument();
  fireEvent.click(retry);
  await waitFor(() => {
    return expect(recoverPage).toHaveBeenCalledTimes(2);
  });
  resources.dispose();
});

it("restores an evicted expanded fan only after positive intersection", () => {
  const entries: Array<{
    callback: IntersectionObserverCallback;
    nodes: Set<Element>;
  }> = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      entry: (typeof entries)[number];
      constructor(callback: IntersectionObserverCallback) {
        this.entry = { callback, nodes: new Set() };
        entries.push(this.entry);
      }
      observe(node: Element) {
        this.entry.nodes.add(node);
      }
      unobserve(node: Element) {
        this.entry.nodes.delete(node);
      }
      disconnect() {
        this.entry.nodes.clear();
      }
    },
  );
  const burst = {
    burstId: "burst",
    visibleFrameCount: 200,
    hasUnseenFrames: true,
    startsAt: "2026-01-01T12:00:00Z",
    endsAt: "2026-01-01T12:00:01Z",
    coverItemId: "cover",
  };
  const onOpenBurst = vi.fn();
  const result = render(
    <MantineProvider>
      <DayStream
        days={[makeDay({ items: [makeItem({ burst })] })]}
        countLabel={undefined}
        framesByBurstId={new Map()}
        expanded={new Map([["burst", { height: 12000 }]])}
        onOpenBurst={onOpenBurst}
        onOpenItem={() => {}}
        onReachEnd={() => {}}
        hasMore={false}
      />
    </MantineProvider>,
  );
  const target = result.container.querySelector(
    '[data-restore-burst="burst"]',
  )!;
  expect(target).toBeInTheDocument();
  const entry = entries.find((observerEntry) => {
    return observerEntry.nodes.has(target);
  })!;
  entry.callback(
    [
      {
        target,
        isIntersecting: true,
        intersectionRatio: 0,
      } as IntersectionObserverEntry,
    ],
    {} as IntersectionObserver,
  );
  expect(onOpenBurst).not.toHaveBeenCalled();
  entry.callback(
    [
      {
        target,
        isIntersecting: true,
        intersectionRatio: 0.1,
      } as IntersectionObserverEntry,
    ],
    {} as IntersectionObserver,
  );
  expect(onOpenBurst).toHaveBeenCalledExactlyOnceWith("burst");
  result.unmount();
  entry.callback(
    [
      {
        target,
        isIntersecting: true,
        intersectionRatio: 1,
      } as IntersectionObserverEntry,
    ],
    {} as IntersectionObserver,
  );
  expect(onOpenBurst).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});

it("finishes a missing-item restore at a surviving position without endless retry", async () => {
  const { createMediaLoadingResources, createMediaLoadingLifetime } =
    await import("@/media/createMediaLoadingResources");
  const { MediaLoadingContext } = await import("@/media/MediaLoadingContext");
  const resources = createMediaLoadingResources({
    memberId: "member",
    lifetime: createMediaLoadingLifetime(),
  });
  resources.timeline.get("view").anchor = {
    capturedOn: "2026-01-01",
    itemId: "removed",
    offsetPx: 120,
    pageCursor: "issued",
  };
  const recoverPage = vi.fn().mockResolvedValue(undefined);
  const result = render(
    <MantineProvider>
      <MediaLoadingContext value={resources}>
        <DayStream
          days={[makeDay()]}
          countLabel={undefined}
          framesByBurstId={new Map()}
          onOpenBurst={() => {}}
          onOpenItem={() => {}}
          onReachEnd={() => {}}
          hasMore={false}
          viewKey="view"
          recoverPage={recoverPage}
        />
      </MediaLoadingContext>
    </MantineProvider>,
  );
  await waitFor(() => {
    return expect(recoverPage).toHaveBeenCalledOnce();
  });
  await new Promise<void>((done) => {
    return requestAnimationFrame(() => {
      return requestAnimationFrame(() => {
        return done();
      });
    });
  });
  expect(
    result.queryByRole("button", { name: "Retry returning to your place" }),
  ).not.toBeInTheDocument();
  result.unmount();
  resources.dispose();
});

it("restores a retained cursor position without another metadata read", async () => {
  const { createMediaLoadingResources, createMediaLoadingLifetime } =
    await import("@/media/createMediaLoadingResources");
  const { MediaLoadingContext } = await import("@/media/MediaLoadingContext");
  const resources = createMediaLoadingResources({
    memberId: "member",
    lifetime: createMediaLoadingLifetime(),
  });
  const day = makeDay();
  resources.timeline.get("cached").anchor = {
    capturedOn: day.capturedOn,
    itemId: day.items[0]!.itemId,
    offsetPx: 120,
    pageCursor: "issued-retained",
  };
  const recoverPage = vi.fn();
  const result = render(
    <MantineProvider>
      <MediaLoadingContext value={resources}>
        <DayStream
          days={[day]}
          countLabel={undefined}
          framesByBurstId={new Map()}
          onOpenBurst={() => {}}
          onOpenItem={() => {}}
          onReachEnd={() => {}}
          hasMore={false}
          viewKey="cached"
          recoverPage={recoverPage}
        />
      </MediaLoadingContext>
    </MantineProvider>,
  );
  await new Promise<void>((done) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        done();
      });
    });
  });
  expect(recoverPage).not.toHaveBeenCalled();
  expect(
    result.queryByRole("button", { name: "Retry returning to your place" }),
  ).not.toBeInTheDocument();
  result.unmount();
  resources.dispose();
});
