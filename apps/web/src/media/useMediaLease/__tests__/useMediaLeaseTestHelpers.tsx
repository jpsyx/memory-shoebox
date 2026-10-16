import type { ReactNode } from "react";

import { afterEach, beforeEach, vi } from "vitest";

import type { MediaRef } from "@memory-shoebox/shared";

import { makeVideoDetail } from "@/testing/itemFixtureHelpers";

import { makeMediaWrapperFromResources } from "@/testing/makeMediaWrapperFromResources";

import { createMediaLoadingResources } from "../../createMediaLoadingResources/createMediaLoadingResources";
import { createMediaLoadingLifetime } from "../../createMediaLoadingResources/createMediaLoadingLifetime";
type LeaseHarness = {
  resources: ReturnType<typeof createMediaLoadingResources>;
  requests: Array<{ itemIds: string[]; purpose: string }>;
  fetcher: ReturnType<
    typeof vi.fn<(_url: string, init: RequestInit) => Promise<Response>>
  >;
  wrapper: (props: { children: ReactNode }) => ReactNode;
};

/** Authorized video detail used as the baseline lease source identities. */
export const detail = makeVideoDetail();
/**
 * Returns video media with configurable expiry and URL identity for renewal
 * tests, keeping poster absent.
 */
export function makeMediaFromExpiry({
  expires = 120000,
  suffix = "old",
}: Readonly<{ expires?: number; suffix?: string }> = {}): MediaRef {
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
/**
 * Creates member-scoped loading resources and a context wrapper with recorded
 * fake preview responses; callers own resource disposal and the lifecycle
 * restores fetch.
 */
export function createLeaseHarness(): LeaseHarness {
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
            media: makeMediaFromExpiry({ expires: 3600000, suffix: "renewed" }),
          };
        }),
      }),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  const wrapper = makeMediaWrapperFromResources(resources);
  return { resources, requests, fetcher, wrapper };
}
/**
 * Starts each lease scenario visible at fake time zero, then restores real
 * timers and stubbed globals.
 */
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
