import type { ReactNode } from "react";

import { afterEach, beforeEach, vi } from "vitest";

import type { MediaRef } from "@memory-shoebox/shared";

import { makeVideoDetail } from "@/testing/itemFixtureHelpers";

import { MediaLoadingContext } from "../../MediaLoadingContext";

import {
  createMediaLoadingLifetime,
  createMediaLoadingResources,
} from "../../createMediaLoadingResources/createMediaLoadingResources";

/** Shared scenario fixture. */
export const detail = makeVideoDetail();
/** Shared scenario fixture. */
export function makeMediaFromExpiry(
  expires = 120_000,
  suffix = "old",
): MediaRef {
  return {
    ...detail.media,
    thumb: {
      ...detail.media.thumb!,
      expiresAt: new Date(expires).toISOString(),
    },
    poster: null,
    playback: {
      ...detail.media.playback!,
      purpose: "original",
      url: `https://example.invalid/${suffix}.mp4`,
      expiresAt: new Date(expires).toISOString(),
    },
  };
}
/** Shared scenario fixture. */
export function createLeaseHarness(): {
  resources: ReturnType<typeof createMediaLoadingResources>;
  requests: Array<{ itemIds: string[]; purpose: string }>;
  fetcher: ReturnType<
    typeof vi.fn<(_url: string, init: RequestInit) => Promise<Response>>
  >;
  wrapper: (props: { children: ReactNode }) => ReactNode;
} {
  const resources = createMediaLoadingResources({
    memberId: "first",
    lifetime: createMediaLoadingLifetime(),
  });
  const requests: Array<{ itemIds: string[]; purpose: string }> = [];
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as {
      itemIds: string[];
      purpose: string;
    };
    requests.push(body);
    return new Response(
      JSON.stringify({
        items: body.itemIds.map((itemId) => {
          return {
            itemId,
            kind: "video",
            width: 1600,
            height: 1067,
            media: makeMediaFromExpiry(3_600_000, "renewed"),
          };
        }),
      }),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  const wrapper = ({ children }: { children: ReactNode }) => {
    return (
      <MediaLoadingContext value={resources}>{children}</MediaLoadingContext>
    );
  };
  return { resources, requests, fetcher, wrapper };
}
/** Registers the owned scenario setup and cleanup. */
export function installUseMediaLeaseTestLifecycle(): void {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
}
