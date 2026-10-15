import { createTimelineMemory } from "@/surfaces/Timeline/windowing/createTimelineMemory";
import {
  createMediaLeaseCoordinator,
  type MediaLeaseCoordinator,
} from "./createMediaLeaseCoordinator";
import {
  createMediaNavigation,
  type MediaNavigation,
} from "./createMediaNavigation";
import type {
  MediaNeighborsRequest,
  MediaNeighborsResponse,
  MediaPreview,
  MediaPreviewRequest,
} from "@memory-shoebox/shared";
import {
  fetchMediaNeighbors,
  fetchMediaPreviews,
} from "@/api/mediaPreview/mediaPreview";
import {
  createMediaPreviewStore,
  type MediaPreviewStore,
} from "./createMediaPreviewStore";
import { createMediaPrefetchScheduler } from "./createMediaPrefetchScheduler";
import {
  createMediaOperationGate,
  type MediaOperationGate,
} from "./createMediaOperationGate";
import { loadSpeculativeMedia } from "./loadSpeculativeMedia";
import type {
  MediaPrefetchScheduler,
  SpeculativeMediaLoader,
} from "./mediaPrefetch.types";

/** Shared settlement only; no member metadata crosses this lifetime. */
export type MediaLoadingLifetime = MediaOperationGate & {
  /** Delays the next member's speculation until old owned work settles. */
  retire: (work: ReadonlyArray<Promise<unknown>>) => void;
};
/** Owns the app-wide operation cap across member/provider replacement. */
export function createMediaLoadingLifetime(): MediaLoadingLifetime {
  const gate = createMediaOperationGate();
  let retiredWork = Promise.resolve();
  return {
    run: (signal, operation) => {
      const priorMember = retiredWork;
      return gate.run(signal, async () => {
        await priorMember;
        signal.throwIfAborted();
        return operation();
      });
    },
    retire: (work) => {
      retiredWork = Promise.allSettled([retiredWork, ...work]).then(() => {});
    },
  };
}

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
  readPreviews: (
    request: Readonly<MediaPreviewRequest>,
    priority?: "foreground" | "speculative",
  ) => Promise<MediaPreview[]>;
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
  navigation?: MediaNavigation;
  leases?: MediaLeaseCoordinator;
  thumbnails?: MediaLoadingResources["thumbnails"];
  timeline?: ReturnType<typeof createTimelineMemory>;
};

function _track<T>(state: ResourceState, work: Promise<T>): Promise<T> {
  const tracked = work.finally(() => {
    state.work.delete(tracked);
  });
  state.work.add(tracked);
  return tracked;
}

async function _read<T>(
  state: ResourceState,
  options: {
    request: (signal: AbortSignal) => Promise<T>;
    getPreviews: (response: T) => MediaPreview[];
    foreground: boolean;
  },
): Promise<T> {
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
    const response = await _track(
      state,
      options.foreground ? read() : state.lifetime.run(controller.signal, read),
    );
    controller.signal.throwIfAborted();
    state.previews.put(options.getPreviews(response), epoch);
    return response;
  } finally {
    state.requests.delete(controller);
  }
}

function _readPreviews(
  state: ResourceState,
  request: Readonly<MediaPreviewRequest>,
  priority: "foreground" | "speculative",
): Promise<MediaPreview[]> {
  return _read(state, {
    request: (signal) => {
      return fetchMediaPreviews(request, signal);
    },
    getPreviews: (response) => {
      return response;
    },
    foreground:
      request.purpose === "selected-view" || priority === "foreground",
  });
}

function _readNeighbors(
  state: ResourceState,
  request: Readonly<MediaNeighborsRequest>,
): Promise<MediaNeighborsResponse> {
  return _read(state, {
    request: (signal) => {
      return fetchMediaNeighbors(request, signal);
    },
    getPreviews: (response) => {
      return [...response.ahead, ...response.behind];
    },
    foreground: false,
  });
}

function _clearWork(
  state: ResourceState,
  scheduler: Readonly<MediaPrefetchScheduler>,
): void {
  scheduler.clear();
  state.requests.forEach((controller) => {
    controller.abort();
  });
}

function _clearMember(
  state: ResourceState,
  scheduler: Readonly<MediaPrefetchScheduler>,
): void {
  state.timeline?.clear();
  state.thumbnails?.reset();
  state.leases?.clear();
  state.navigation?.clear();
  _clearWork(state, scheduler);
  state.previews.clear();
  state.lifetime.retire([...state.work]);
}

function _dispose(
  state: ResourceState,
  scheduler: Readonly<MediaPrefetchScheduler>,
): void {
  if (!state.disposed) {
    state.disposed = true;
    _clearMember(state, scheduler);
    scheduler.dispose();
  }
}

function _makeSchedulerFromState(
  state: ResourceState,
  load: SpeculativeMediaLoader,
): MediaPrefetchScheduler {
  return createMediaPrefetchScheduler({
    load: (candidate, signal) => {
      return _track(
        state,
        state.lifetime.run(signal, () => {
          if (Date.parse(candidate.source.expiresAt) <= Date.now()) {
            throw new Error("Speculative source expired while queued");
          }
          return load(candidate, signal);
        }),
      );
    },
    clock: Date.now,
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
  const state: ResourceState = {
    previews: createMediaPreviewStore(options.memberId),
    lifetime: options.lifetime,
    requests: new Set(),
    work: new Set(),
    disposed: false,
  };
  const scheduler = _makeSchedulerFromState(
    state,
    options.load ?? loadSpeculativeMedia,
  );
  const navigation = createMediaNavigation(scheduler);
  state.navigation = navigation;
  const leases = createMediaLeaseCoordinator({
    store: state.previews,
    onAuthorizationLoss: () => {
      return _clearMember(state, scheduler);
    },
    read: (request) => {
      return _readPreviews(state, request, "foreground");
    },
  });
  state.leases = leases;
  const eagerIds = new Set<string>();
  let isInitialViewport = true;
  const thumbnails = {
    claim: (itemId: string) => {
      if (eagerIds.has(itemId)) return true;
      if (!isInitialViewport || eagerIds.size >= 6) return false;
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
  state.thumbnails = thumbnails;
  const timeline = createTimelineMemory();
  state.timeline = timeline;
  return {
    timeline,
    thumbnails,
    leases,
    navigation,
    memberId: options.memberId,
    previews: state.previews,
    scheduler,
    clearWork: () => {
      _clearWork(state, scheduler);
    },
    readPreviews: (request, priority = "speculative") => {
      return _readPreviews(state, request, priority);
    },
    clearMember: () => {
      _clearMember(state, scheduler);
    },
    readNeighbors: (request) => {
      return _readNeighbors(state, request);
    },
    dispose: () => {
      _dispose(state, scheduler);
    },
  };
}
