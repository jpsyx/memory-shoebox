import type { MediaPreview, MediaRef } from "@memory-shoebox/shared";

import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";

import type { MediaPreviewStore } from "../createMediaPreviewStore/createMediaPreviewStore";

import {
  type Entry,
  type LeaseConsumer,
  type MediaLeaseCoordinator,
  type MediaLeaseRegistration,
  type State,
} from "./createMediaLeaseCoordinator.types";

export type { MediaLeaseSnapshot } from "./createMediaLeaseCoordinator.types";

export type { MediaLeaseRegistration } from "./createMediaLeaseCoordinator.types";

export type { MediaLeaseCoordinator } from "./createMediaLeaseCoordinator.types";

export type { LeaseConsumer } from "./createMediaLeaseCoordinator.types";

import {
  clearMediaLeaseState,
  getEntryFromMediaConsumer,
  getExpiryFromMediaLease,
  getSourceIdentityFromMedia,
  listenForMediaReturn,
  publishMediaLeaseSnapshot,
  seedMediaPreviewStore,
} from "./mediaLeaseStateHelpers";

function _schedule(state: State): void {
  clearTimeout(state.timer);
  if (document.visibilityState !== "visible") {
    return;
  }
  const eligible = [...state.entries.values()].filter((entry) => {
    return (
      !entry.denied &&
      !entry.pending &&
      entry.attemptedUrl === undefined &&
      [...entry.consumers.values()].some(Boolean)
    );
  });
  const delay = Math.min(
    ...eligible.map((entry) => {
      return getExpiryFromMediaLease(entry) - Date.now() - 60_000;
    }),
  );
  if (!Number.isFinite(delay)) {
    return;
  }
  state.timer = setTimeout(
    () => {
      eligible
        .filter((entry) => {
          return getExpiryFromMediaLease(entry) <= Date.now() + 60_000;
        })
        .forEach((entry) => {
          void _renew(state, entry);
        });
      _schedule(state);
    },
    Math.min(Math.max(0, delay), 2_147_483_647),
  );
}

function _deny(state: State, itemId: string): void {
  state.deniedIds.add(itemId);
  state.store.remove(itemId);
  state.entries.forEach((entry) => {
    if (entry.itemId === itemId) {
      entry.denied = true;
      publishMediaLeaseSnapshot(entry, { media: undefined, hasError: true });
    }
  });
}

function _acceptPreviews(
  state: State,
  entries: Entry[],
  previews: MediaPreview[],
): void {
  entries.forEach((entry) => {
    if (state.entries.get(`${entry.purpose}:${entry.itemId}`) !== entry) {
      return;
    }
    const preview = previews.find((candidate) => {
      return candidate.itemId === entry.itemId;
    });
    if (preview === undefined) {
      _deny(state, entry.itemId);
      return;
    }
    entry.denied = false;
    state.deniedIds.delete(entry.itemId);
    state.authorizationLost = false;
    listenForMediaReturn(state.onReturn, true);
    publishMediaLeaseSnapshot(entry, { media: preview.media, hasError: false });
    entry.attemptedUrl =
      getExpiryFromMediaLease(entry) > Date.now() + 60_000
        ? undefined
        : "stale";
  });
}

function _onFailure(state: State, entries: Entry[], error: unknown): void {
  if (
    error instanceof ApiRequestError &&
    [401, 403, 404].includes(error.status)
  ) {
    if (error.status === 404) {
      entries.forEach((entry) => {
        _deny(state, entry.itemId);
      });
    } else {
      state.onAuthorizationLoss();
      state.authorizationLost = true;
    }
  } else if (error instanceof DOMException && error.name === "AbortError") {
    entries.forEach((entry) => {
      entry.attemptedUrl = undefined;
    });
  } else {
    entries.forEach((entry) => {
      publishMediaLeaseSnapshot(entry, { ...entry.snapshot, hasError: true });
    });
  }
}

async function _readBatch(state: State, entries: Entry[]): Promise<void> {
  const epoch = state.store.captureEpoch();
  let wasCurrent = false;
  try {
    const previews = await state.read({
      itemIds: entries.map((entry) => {
        return entry.itemId;
      }),
      purpose: entries[0]!.purpose,
    });
    if (state.store.captureEpoch() === epoch) {
      wasCurrent = true;
      _acceptPreviews(state, entries, previews);
    }
  } catch (error) {
    if (state.store.captureEpoch() === epoch) {
      wasCurrent = true;
      _onFailure(state, entries, error);
    }
  } finally {
    entries.forEach((entry) => {
      if (
        !wasCurrent &&
        !entry.denied &&
        state.entries.get(`${entry.purpose}:${entry.itemId}`) === entry &&
        getExpiryFromMediaLease(entry) <= Date.now() + 60_000
      ) {
        _queue(state, entry);
        return;
      }
      entry.settle?.(entry.denied ? undefined : entry.snapshot.media);
      entry.pending = undefined;
      entry.isExplicit = false;
      entry.settle = undefined;
    });
    _schedule(state);
  }
}

function _flush(state: State): void {
  state.flushTimer = undefined;
  const queued = [...state.queue].filter((entry) => {
    if (
      entry.isExplicit ||
      (document.visibilityState === "visible" &&
        [...entry.consumers.values()].some(Boolean))
    ) {
      return true;
    }
    entry.settle?.(entry.snapshot.media);
    entry.pending = undefined;
    entry.settle = undefined;
    entry.attemptedUrl = undefined;
    return false;
  });
  state.queue.clear();
  for (const purpose of ["selected-view", "speculative-preview"] as const) {
    const entries = queued.filter((entry) => {
      return entry.purpose === purpose;
    });
    for (let index = 0; index < entries.length; index += 8) {
      void _readBatch(state, entries.slice(index, index + 8));
    }
  }
}

function _renew(
  state: State,
  entry: Entry,
  isExplicit = false,
): Promise<MediaRef | undefined> {
  entry.isExplicit ||= isExplicit;
  if (entry.pending !== undefined) {
    return entry.pending;
  }
  entry.attemptedUrl = "attempted";
  entry.pending = new Promise((resolve) => {
    entry.settle = resolve;
  });
  _queue(state, entry);
  return entry.pending;
}

function _queue(state: State, entry: Entry): void {
  state.queue.add(entry);
  state.flushTimer ??= setTimeout(() => {
    _flush(state);
  }, 0);
}

function _updateInitial(state: State, entry: Entry, media: MediaRef): void {
  if (
    !entry.denied &&
    getSourceIdentityFromMedia(media) !==
      getSourceIdentityFromMedia(entry.initialMedia)
  ) {
    state.store.remove(entry.itemId);
    seedMediaPreviewStore(state, entry.itemId, media);
    entry.attemptedUrl = undefined;
    publishMediaLeaseSnapshot(entry, { media, hasError: false });
    _schedule(state);
  }
  entry.initialMedia = media;
}

function _register(
  state: State,
  consumer: Readonly<LeaseConsumer>,
): MediaLeaseRegistration {
  const entry = getEntryFromMediaConsumer(state, consumer);
  entry.consumers.set(consumer.onChange, consumer.isVisible);
  consumer.onChange(entry.snapshot);
  _schedule(state);
  return {
    renew: () => {
      return _renew(state, entry, true);
    },
    updateInitial: (media) => {
      _updateInitial(state, entry, media);
    },
    setVisible: (isVisible) => {
      entry.consumers.set(consumer.onChange, isVisible);
      _schedule(state);
    },
    release: () => {
      entry.consumers.delete(consumer.onChange);
      if (entry.consumers.size === 0) {
        state.entries.delete(`${entry.purpose}:${entry.itemId}`);
        state.queue.delete(entry);
        entry.settle?.(undefined);
      }
      _schedule(state);
    },
  };
}

/** Uses one timer and eight-ID foreground batches for the mounted consumers. */
export function createMediaLeaseCoordinator(
  options: Readonly<{
    store: MediaPreviewStore;
    read: State["read"];
    onAuthorizationLoss: () => void;
  }>,
): MediaLeaseCoordinator {
  const state: State = {
    ...options,
    deniedIds: new Set(),
    authorizationLost: false,
    entries: new Map(),
    queue: new Set(),
    timer: undefined,
    flushTimer: undefined,
    onReturn: () => {
      state.entries.forEach((entry) => {
        if (!entry.denied && entry.snapshot.hasError && !entry.pending) {
          entry.attemptedUrl = undefined;
        }
      });
      _schedule(state);
    },
  };
  return {
    register: (consumer) => {
      listenForMediaReturn(state.onReturn, true);
      const registration = _register(state, consumer);
      return {
        ...registration,
        release: () => {
          registration.release();
          if (state.entries.size === 0) {
            listenForMediaReturn(state.onReturn, false);
          }
        },
      };
    },
    clear: () => {
      clearMediaLeaseState(state);
      listenForMediaReturn(state.onReturn, false);
    },
    isDenied: (itemId) => {
      return state.authorizationLost || state.deniedIds.has(itemId);
    },
  };
}
