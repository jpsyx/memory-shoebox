import type { MediaSource } from "@memory-shoebox/shared";
import { vi } from "vitest";
import {
  createMediaLoadingResources,
  type MediaLoadingResources,
} from "../../createMediaLoadingResources/createMediaLoadingResources";
import { createMediaLoadingLifetime } from "../../createMediaLoadingResources/createMediaLoadingLifetime";

/** Starts one held speculative decode and exposes its cancellation signal. */
export async function startHeldMediaLoading(
  source: Readonly<MediaSource>,
): Promise<{
  resources: MediaLoadingResources;
  getSignal: () => AbortSignal;
}> {
  let signal: AbortSignal | undefined;
  const resources = createMediaLoadingResources({
    memberId: "member",
    lifetime: createMediaLoadingLifetime(),
    load: ({ signal: operationSignal }) => {
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
  await vi.advanceTimersByTimeAsync(250);
  return {
    resources,
    getSignal: () => {
      if (!signal) {
        throw new Error("The held media request did not start.");
      }
      return signal;
    },
  };
}
