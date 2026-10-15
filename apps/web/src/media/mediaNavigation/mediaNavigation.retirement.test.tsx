import { type ReactNode } from "react";

import { act, render } from "@testing-library/react";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMediaLoadingLifetime,
  createMediaLoadingResources,
  type MediaLoadingResources,
} from "../createMediaLoadingResources/createMediaLoadingResources";

import { MediaLoadingProvider } from "../MediaLoadingProvider/MediaLoadingProvider";

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
  it("replaces a pending same-rendition lease before releasing stale callbacks", async () => {
    vi.useFakeTimers();
    const { resources, getSignal } = await _active();
    const staleRelease = resources.navigation.prepare({
      itemId: "target",
      source,
    });
    resources.clearWork();
    const currentRelease = resources.navigation.prepare({
      itemId: "target",
      source,
    });
    staleRelease();
    resources.navigation.complete(staleRelease);
    expect(getSignal().aborted).toBe(false);
    const view = render(<Owner resources={resources} itemId="target" />);
    resources.navigation.complete(currentRelease);
    staleRelease();
    resources.clearWork();
    expect(getSignal().aborted).toBe(false);
    view.unmount();
    await act(async () => {});
    expect(getSignal().aborted).toBe(true);
  });
});
describe("viewer promotion ownership", () => {
  it.each(["rejected", "redirected", "unadopted", "superseded", "retired"])(
    "releases %s navigation without an orphan lease",
    async (reason) => {
      vi.useFakeTimers();
      const { resources, getSignal } = await _active();
      const cancel = resources.navigation.prepare({ itemId: "target", source });
      resources.clearWork();
      expect(getSignal().aborted).toBe(false);
      await act(async () => {
        if (reason === "rejected") {
          cancel();
        }
        if (reason === "redirected") {
          render(<Owner resources={resources} itemId="redirect" />);
        }
        if (reason === "unadopted") {
          resources.navigation.finishRoute();
        }
        if (reason === "superseded") {
          resources.navigation.prepare({
            itemId: "new-target",
            source: undefined,
          });
          cancel();
        }
        if (reason === "retired") {
          resources.clearMember();
        }
      });
      expect(getSignal().aborted).toBe(true);
    },
  );
});
