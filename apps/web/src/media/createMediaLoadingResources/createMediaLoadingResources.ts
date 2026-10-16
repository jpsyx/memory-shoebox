import {
  fetchMediaNeighbors,
  fetchMediaPreviews,
} from "@/api/mediaPreviewHelpers/mediaPreviewHelpers";
import { createTimelineMemory } from "@/surfaces/Timeline/windowing/createTimelineMemory/createTimelineMemory";
import type {
  MediaNeighborsRequest,
  MediaNeighborsResponse,
  MediaPreview,
  MediaPreviewRequest,
} from "@memory-shoebox/shared";
import {
  createMediaLeaseCoordinator,
  type MediaLeaseCoordinator,
} from "../createMediaLeaseCoordinator/createMediaLeaseCoordinator";
import {
  createMediaNavigation,
  type MediaNavigation,
} from "../createMediaNavigation";
import type { MediaLoadingLifetime } from "./createMediaLoadingLifetime";
import { createMediaPrefetchScheduler } from "../createMediaPrefetchScheduler/createMediaPrefetchScheduler";
import {
  createMediaPreviewStore,
  type MediaPreviewStore,
} from "../createMediaPreviewStore/createMediaPreviewStore";
import { loadSpeculativeMedia } from "../loadSpeculativeMedia/loadSpeculativeMedia";
import type {
  MediaPrefetchScheduler,
  SpeculativeMediaLoader,
} from "../mediaPrefetch.types";

/** One member's media-only state and owned asynchronous operations. */
export type MediaLoadingResources = {
  memberId: string;
  /** Private compact positions are retired with member media authority. */
  timeline: ReturnType<typeof createTimelineMemory>;
  /** One committed surface's shared initial-viewport thumbnail budget. */
  thumbnails: {
    claim: (itemId: string) => boolean;
    reset: () => void;
    close: () => void;
  };
  leases: MediaLeaseCoordinator;
  scheduler: MediaPrefetchScheduler;
  navigation: MediaNavigation;
  previews: MediaPreviewStore;
  /** Explicit urgency is independent of the safe representation purpose. */
  readPreviews: ({
    request,
    priority,
  }: Readonly<{
    request: Readonly<MediaPreviewRequest>;
    priority?: "foreground" | "speculative";
  }>) => Promise<MediaPreview[]>;
  /** Safe neighboring media only, never an actual-detail cache read. */
  readNeighbors: (
    request: Readonly<MediaNeighborsRequest>,
  ) => Promise<MediaNeighborsResponse>;
  /** Cancels obsolete work while preserving already warmed route metadata. */
  clearWork: () => void;
  /** Retires private state now; StrictMode may immediately reuse this owner. */
  clearMember: () => void;
  /** Permanently disposes this owner after clearing its private state. */
  dispose: () => void;
};

type ResourceState = {
  previews: MediaPreviewStore;
  lifetime: MediaLoadingLifetime;
  requests: Set<AbortController>;
  work: Set<Promise<unknown>>;
  disposed: boolean;
  navigation: MediaNavigation;
  leases: MediaLeaseCoordinator;
  thumbnails: MediaLoadingResources["thumbnails"];
  timeline: ReturnType<typeof createTimelineMemory>;
};

function _track<T>({
  state,
  work,
}: {
  state: Readonly<Pick<ResourceState, "work">>;
  work: Promise<T>;
}): Promise<T> {
  const tracked = work.finally(() => {
    state.work.delete(tracked);
  });
  state.work.add(tracked);
  return tracked;
}

async function _read<T>({
  state,
  options,
}: {
  state: ResourceState;
  options: {
    request: (signal: AbortSignal) => Promise<T>;
    getPreviews: (response: T) => MediaPreview[];
    foreground: boolean;
  };
}): Promise<T> {
  if (state.disposed) {
    throw new DOMException("Media owner disposed", "AbortError");
  }
  const controller = new AbortController();
  const epoch = state.previews.captureEpoch();
  state.requests.add(controller);
  const read = () => {
    return options.request(controller.signal);
  };
  try {
    const response = await _track({
      state,
      work: options.foreground
        ? read()
        : state.lifetime.run({ signal: controller.signal, operation: read }),
    });
    controller.signal.throwIfAborted();
    state.previews.put({
      previews: options.getPreviews(response),
      epoch: epoch,
    });
    return response;
  } finally {
    state.requests.delete(controller);
  }
}

function _readPreviews({
  state,
  request,
  priority,
}: {
  state: ResourceState;
  request: Readonly<MediaPreviewRequest>;
  priority: "foreground" | "speculative";
}): Promise<MediaPreview[]> {
  return _read({
    state,
    options: {
      request: (signal) => {
        return fetchMediaPreviews({ request, signal });
      },
      getPreviews: (response) => {
        return response;
      },
      foreground:
        request.purpose === "selected-view" || priority === "foreground",
    },
  });
}

function _readNeighbors({
  state,
  request,
}: {
  state: ResourceState;
  request: Readonly<MediaNeighborsRequest>;
}): Promise<MediaNeighborsResponse> {
  return _read({
    state,
    options: {
      request: (signal) => {
        return fetchMediaNeighbors({ request, signal });
      },
      getPreviews: (response) => {
        return [...response.ahead, ...response.behind];
      },
      foreground: false,
    },
  });
}

function _clearWork({
  state,
  scheduler,
}: {
  state: ResourceState;
  scheduler: Readonly<MediaPrefetchScheduler>;
}): void {
  scheduler.clear();
  state.requests.forEach((controller) => {
    controller.abort();
  });
}

function _clearMember({
  state,
  scheduler,
}: {
  state: ResourceState;
  scheduler: Readonly<MediaPrefetchScheduler>;
}): void {
  state.timeline.clear();
  state.thumbnails.reset();
  state.leases.clear();
  state.navigation.clear();
  _clearWork({ state, scheduler });
  state.previews.clear();
  state.lifetime.retire([...state.work]);
}

function _makeSchedulerFromState({
  state,
  load,
}: {
  state: Readonly<Pick<ResourceState, "previews" | "lifetime" | "work">>;
  load: SpeculativeMediaLoader;
}): MediaPrefetchScheduler {
  return createMediaPrefetchScheduler({
    load: ({ candidate, signal }) => {
      return _track({
        state,
        work: state.lifetime.run({
          signal: signal,
          operation: () => {
            if (Date.parse(candidate.source.expiresAt) <= Date.now()) {
              throw new Error("Speculative source expired while queued");
            }
            return load({ candidate: candidate, signal: signal });
          },
        }),
      });
    },
    clock: Date.now,
    getEpoch: state.previews.captureEpoch,
  });
}

/** Creates the resources owned by a member's provider. */
export function createMediaLoadingResources(
  options: Readonly<{
    memberId: string;
    lifetime: MediaLoadingLifetime;
    load?: SpeculativeMediaLoader;
  }>,
): MediaLoadingResources {
  const previews = createMediaPreviewStore(options.memberId);
  const work = new Set<Promise<unknown>>();
  const scheduler = _makeSchedulerFromState({
    state: { previews, lifetime: options.lifetime, work },
    load: options.load ?? loadSpeculativeMedia,
  });
  const navigation = createMediaNavigation(scheduler);
  const ownedPreviews: MediaPreviewStore = {
    ...previews,
    remove: (itemId) => {
      previews.remove(itemId);
      navigation.clear();
      scheduler.clear();
    },
    clear: () => {
      previews.clear();
      navigation.clear();
      scheduler.clear();
    },
  };
  const leases = createMediaLeaseCoordinator({
    store: ownedPreviews,
    onAuthorizationLoss: () => {
      return _clearMember({ state, scheduler });
    },
    read: (request) => {
      return _readPreviews({ state, request, priority: "foreground" });
    },
  });
  const eagerIds = new Set<string>();
  let isInitialViewport = true;
  const thumbnails = {
    claim: (itemId: string) => {
      if (eagerIds.has(itemId)) {
        return true;
      }
      if (!isInitialViewport || eagerIds.size >= 6) {
        return false;
      }
      eagerIds.add(itemId);
      return true;
    },
    reset: () => {
      eagerIds.clear();
      isInitialViewport = true;
    },
    close: () => {
      isInitialViewport = false;
    },
  };
  const timeline = createTimelineMemory();
  const state: ResourceState = {
    previews: ownedPreviews,
    lifetime: options.lifetime,
    requests: new Set(),
    work,
    disposed: false,
    navigation,
    leases,
    thumbnails,
    timeline,
  };
  return {
    timeline,
    thumbnails,
    leases,
    navigation,
    memberId: options.memberId,
    previews: state.previews,
    scheduler,
    clearWork: () => {
      _clearWork({ state, scheduler });
    },
    readPreviews: ({ request, priority = "speculative" }) => {
      return _readPreviews({ state, request, priority });
    },
    clearMember: () => {
      _clearMember({ state, scheduler });
    },
    readNeighbors: (request) => {
      return _readNeighbors({ state, request });
    },
    dispose: () => {
      if (!state.disposed) {
        state.disposed = true;
        _clearMember({ state, scheduler });
        scheduler.dispose();
      }
    },
  };
}
