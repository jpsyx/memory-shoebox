import { type ReactNode } from "react";

import { act, fireEvent, render, screen } from "@testing-library/react";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMediaLoadingLifetime,
  createMediaLoadingResources,
  type MediaLoadingResources,
} from "../createMediaLoadingResources/createMediaLoadingResources";

import { MediaLoadingProvider } from "../MediaLoadingProvider/MediaLoadingProvider";

import { useItemNavigationMove } from "@/surfaces/Item/ItemViewer/ItemNavigation/useItemNavigationMove";

import { QueryClient } from "@tanstack/react-query";

import { MediaLoadingContext } from "../MediaLoadingContext";

import { PhotoFrame } from "@/surfaces/Item/ItemViewer/PhotoFrame/PhotoFrame";

import { makeItemDetail } from "@/testing/itemFixtureHelpers";

import { makeMediaSource } from "@/surfaces/Timeline/timelineFixtures";

const injected = vi.hoisted(() => {
  return {
    resources: undefined as MediaLoadingResources | undefined,
    router: { state: { location: {} }, navigate: vi.fn<() => Promise<void>>() },
  };
});

vi.mock("../useMediaLoadingResources", () => {
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
};

function Owner({
  resources,
  itemId,
}: {
  resources: MediaLoadingResources;
  itemId: string;
}): ReactNode {
  injected.resources = resources;
  return (
    <MediaLoadingProvider memberId="member" routeKey={`/items/${itemId}`}>
      <PhotoFrame media={media} itemId={itemId} />
    </MediaLoadingProvider>
  );
}

function Navigation(): ReactNode {
  const movement = useItemNavigationMove({
    context: {
      detail: makeItemDetail(),
      selection: { tags: [], people: [] },
      queryClient: new QueryClient(),
      memberId: "member",
    },
    targets: { next: { itemId: "target" } },
    isUnavailable: false,
  });
  return (
    <>
      <button
        onClick={() => {
          void movement.move("next");
        }}
      >
        Move
      </button>
      <output>{movement.error}</output>
    </>
  );
}

async function _active() {
  let signal: AbortSignal | undefined;
  const resources = createMediaLoadingResources({
    memberId: "member",
    lifetime: createMediaLoadingLifetime(),
    load: (_candidate, operationSignal) => {
      signal = operationSignal;
      return new Promise(() => {});
    },
  });
  resources.navigation.viewport = {
    cssWidth: 600,
    cssHeight: 600,
    devicePixelRatio: 1,
    supportsWebp: true,
  };
  resources.scheduler.schedule(
    [{ itemId: "target", source, kind: "photo", rank: 0, decode: true }],
    {
      memberId: "member",
      selectionKey: "old",
      visible: true,
      saveData: false,
      effectiveType: "4g",
    },
  );
  await vi.advanceTimersByTimeAsync(250);
  return {
    resources,
    getSignal: () => {
      return signal!;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("viewer promotion ownership", () => {
  it("transfers the existing lease to the exact PhotoFrame across route cleanup and releases on exit", async () => {
    vi.useFakeTimers();
    const { resources, getSignal } = await _active();
    resources.navigation.prepare({ itemId: "target", source });
    const view = render(<Owner resources={resources} itemId="target" />);
    expect(getSignal().aborted).toBe(false);
    view.rerender(<Owner resources={resources} itemId="different" />);
    await act(async () => {});
    expect(getSignal().aborted).toBe(true);
  });
});
describe("viewer promotion ownership", () => {
  it("keeps one source owned when pending preview becomes authorized detail", async () => {
    vi.useFakeTimers();
    const { resources, getSignal } = await _active();
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
    const { resources, getSignal } = await _active();
    resources.previews.put([
      { itemId: "target", kind: "photo", width: 960, height: 720, media },
    ]);
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
    const { resources, getSignal } = await _active();
    resources.previews.put([
      { itemId: "target", kind: "photo", width: 960, height: 720, media },
    ]);
    injected.resources = resources;
    const navigation = Promise.withResolvers<void>();
    injected.router.navigate.mockReturnValueOnce(navigation.promise);
    const tree = (
      routeKey: string,
      committedSurfaceKey: string,
      hasTarget: boolean,
    ) => {
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
    const view = render(tree("/items/old", "/items/old", false));
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    view.rerender(tree("/items/target", "/items/old", false));
    await act(async () => {});
    expect(getSignal().aborted).toBe(false);
    view.rerender(tree("/items/target", "/items/target", true));
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
    const { resources, getSignal } = await _active();
    resources.previews.put([
      { itemId: "target", kind: "photo", width: 960, height: 720, media },
    ]);
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
    const { resources, getSignal } = await _active();
    resources.previews.put([
      { itemId: "target", kind: "photo", width: 960, height: 720, media },
    ]);
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
    resources.scheduler.schedule(
      [{ itemId: "target", source, kind: "photo", rank: 0, decode: true }],
      {
        memberId: "member",
        selectionKey: "old",
        visible: true,
        saveData: false,
        effectiveType: "4g",
      },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
      fireEvent.click(screen.getByRole("button", { name: "Move" }));
    });
    expect(getSignal().aborted).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Could not open");
  });
});
