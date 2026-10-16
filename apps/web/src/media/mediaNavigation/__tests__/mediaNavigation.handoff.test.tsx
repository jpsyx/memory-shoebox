import { MediaNavigationMove as Navigation } from "./MediaNavigationMove";
import { MediaNavigationOwner as Owner } from "./MediaNavigationOwner";
import { startHeldMediaLoading } from "./startHeldMediaLoading";
import type { MediaRef } from "@memory-shoebox/shared";

import { act, fireEvent, render, screen } from "@testing-library/react";

import { afterEach, describe, expect, it, vi } from "vitest";

import { type MediaLoadingResources } from "../../createMediaLoadingResources/createMediaLoadingResources";

import { MediaLoadingProvider } from "../../MediaLoadingProvider/MediaLoadingProvider";

import { MediaLoadingContext } from "../../MediaLoadingContext";

import { PhotoFrame } from "@/surfaces/Item/ItemViewer/PhotoFrame/PhotoFrame";

import { makeItemDetail } from "@/testing/itemFixtureHelpers";

import { makeMediaSource } from "@/surfaces/Timeline/timelineFixtureHelpers";

const injected = vi.hoisted(() => {
  return {
    resources: undefined as MediaLoadingResources | undefined,
    router: { state: { location: {} }, navigate: vi.fn<() => Promise<void>>() },
  };
});

vi.mock("../../useMediaLoadingResources", () => {
  return {
    useMediaLoadingResources: () => {
      return injected.resources;
    },
  };
});

vi.mock("@tanstack/react-router", () => {
  return {
    useRouter: () => {
      return injected.router;
    },
  };
});

const source = makeMediaSource({
  renditionId: "owned",
  width: 960,
  height: 720,
  expiresAt: "2099-01-01T00:00:00Z",
});

const media = {
  ...makeItemDetail().media,
  display: source,
  thumb: null,
  displayCandidates: [source],
} satisfies MediaRef;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("viewer promotion ownership", () => {
  it("transfers the existing lease to the exact PhotoFrame across route cleanup and releases on exit", async () => {
    vi.useFakeTimers();
    const { resources, getSignal } = await startHeldMediaLoading(source);
    injected.resources = resources;
    resources.navigation.prepare({ itemId: "target", source });
    const view = render(<Owner media={media} itemId="target" />);
    expect(getSignal().aborted).toBe(false);
    view.rerender(<Owner media={media} itemId="different" />);
    await act(async () => {});
    expect(getSignal().aborted).toBe(true);
  });
});
describe("viewer promotion ownership", () => {
  it("keeps one source owned when pending preview becomes authorized detail", async () => {
    vi.useFakeTimers();
    const { resources, getSignal } = await startHeldMediaLoading(source);
    injected.resources = resources;
    resources.navigation.prepare({ itemId: "target", source });
    const view = render(
      <MediaLoadingContext value={resources}>
        <PhotoFrame key="preview" media={media} itemId="target" />
      </MediaLoadingContext>,
    );
    resources.clearWork();
    view.rerender(
      <MediaLoadingContext value={resources}>
        <PhotoFrame key="detail" media={media} itemId="target" />
      </MediaLoadingContext>,
    );
    await act(async () => {});
    expect(getSignal().aborted).toBe(false);
    view.unmount();
    await act(async () => {});
    expect(getSignal().aborted).toBe(true);
  });
});
describe("viewer promotion ownership", () => {
  it("adopts successful movement before route cleanup and releases on actual exit", async () => {
    vi.useFakeTimers();
    const { resources, getSignal } = await startHeldMediaLoading(source);
    injected.resources = resources;
    resources.previews.put({
      previews: [
        { itemId: "target", kind: "photo", width: 960, height: 720, media },
      ],
    });
    injected.resources = resources;
    let finish = () => {};
    injected.router.navigate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const view = render(
      <MediaLoadingProvider memberId="member" routeKey="/items/old">
        <Navigation />
      </MediaLoadingProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    view.rerender(
      <MediaLoadingProvider memberId="member" routeKey="/items/target">
        <PhotoFrame media={media} itemId="target" />
      </MediaLoadingProvider>,
    );
    await act(async () => {
      finish();
    });
    expect(getSignal().aborted).toBe(false);
    view.unmount();
    await act(async () => {});
    expect(getSignal().aborted).toBe(true);
  });
});
describe("viewer promotion ownership", () => {
  it("preserves prepared ownership while a pending route awaits its committed destination", async () => {
    vi.useFakeTimers();
    const { resources, getSignal } = await startHeldMediaLoading(source);
    injected.resources = resources;
    resources.previews.put({
      previews: [
        { itemId: "target", kind: "photo", width: 960, height: 720, media },
      ],
    });
    injected.resources = resources;
    const navigation = Promise.withResolvers<void>();
    injected.router.navigate.mockReturnValueOnce(navigation.promise);
    const tree = ({
      routeKey,
      committedSurfaceKey,
      hasTarget,
    }: {
      routeKey: string;
      committedSurfaceKey: string;
      hasTarget: boolean;
    }) => {
      return (
        <MediaLoadingProvider
          memberId="member"
          routeKey={routeKey}
          committedSurfaceKey={committedSurfaceKey}
        >
          {hasTarget ? (
            <PhotoFrame media={media} itemId="target" />
          ) : (
            <Navigation />
          )}
        </MediaLoadingProvider>
      );
    };
    const view = render(
      tree({
        routeKey: "/items/old",
        committedSurfaceKey: "/items/old",
        hasTarget: false,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    view.rerender(
      tree({
        routeKey: "/items/target",
        committedSurfaceKey: "/items/old",
        hasTarget: false,
      }),
    );
    await act(async () => {});
    expect(getSignal().aborted).toBe(false);
    view.rerender(
      tree({
        routeKey: "/items/target",
        committedSurfaceKey: "/items/target",
        hasTarget: true,
      }),
    );
    await act(async () => {
      navigation.resolve();
    });
    expect(getSignal().aborted).toBe(false);
    view.unmount();
    await act(async () => {});
    expect(getSignal().aborted).toBe(true);
  });
});
describe("viewer promotion ownership", () => {
  it("settles movement without adoption even when the route key does not change", async () => {
    vi.useFakeTimers();
    const { resources, getSignal } = await startHeldMediaLoading(source);
    injected.resources = resources;
    resources.previews.put({
      previews: [
        { itemId: "target", kind: "photo", width: 960, height: 720, media },
      ],
    });
    injected.resources = resources;
    injected.router.navigate.mockResolvedValueOnce(undefined);
    render(
      <MediaLoadingProvider memberId="member" routeKey="/items/old">
        <Navigation />
      </MediaLoadingProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Move" }));
    });
    expect(getSignal().aborted).toBe(true);
  });
});
describe("viewer promotion ownership", () => {
  it("releases a rejected actual navigation promise through the movement consumer", async () => {
    vi.useFakeTimers();
    const { resources, getSignal } = await startHeldMediaLoading(source);
    injected.resources = resources;
    resources.previews.put({
      previews: [
        { itemId: "target", kind: "photo", width: 960, height: 720, media },
      ],
    });
    injected.resources = resources;
    injected.router.navigate.mockRejectedValueOnce(
      new Error("blocked navigation"),
    );
    render(
      <MediaLoadingProvider memberId="member" routeKey="/items/old">
        <Navigation />
      </MediaLoadingProvider>,
    );
    // Provider mount clears old speculation; start the owned operation again.
    resources.scheduler.schedule({
      candidates: [
        { itemId: "target", source, kind: "photo", rank: 0, decode: true },
      ],
      environment: {
        memberId: "member",
        selectionKey: "old",
        visible: true,
        saveData: false,
        effectiveType: "4g",
      },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
      fireEvent.click(screen.getByRole("button", { name: "Move" }));
    });
    expect(getSignal().aborted).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Could not open");
  });
});
