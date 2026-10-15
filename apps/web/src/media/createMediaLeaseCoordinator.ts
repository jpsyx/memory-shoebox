import type {
  MediaRef,
  MediaPreview,
  MediaPreviewRequest,
} from "@memory-shoebox/shared";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import type { MediaPreviewStore } from "./createMediaPreviewStore";

/** The selected source state, separate from ordering and actual-detail data. */
export type MediaLeaseSnapshot = {
  media: MediaRef | undefined;
  hasError: boolean;
};
/** A mounted media consumer reports true visibility, without overscan. */
export type MediaLeaseRegistration = {
  /** Actual intersection or the actively selected viewer, excluding overscan. */
  setVisible: (isVisible: boolean) => void;
  /** Accepts current authorized rendition identities, never clears denial. */
  updateInitial: (media: MediaRef) => void;
  /** A fresh safe read; explicit callers may recover a previously denied ID. */
  renew: () => Promise<MediaRef | undefined>;
  /** Removes this consumer and cancels its queued start when it was the last. */
  release: () => void;
};
/** One member's live consumers and batched authorized media renewals. */
export type MediaLeaseCoordinator = {
  register: (options: Readonly<LeaseConsumer>) => MediaLeaseRegistration;
  clear: () => void;
  /** Prevents cached props from resurrecting a refused source. */
  isDenied: (itemId: string) => boolean;
};
/** Initial media must have come from an authorized catalog read. */
export type LeaseConsumer = {
  itemId: string;
  initialMedia: MediaRef;
  purpose: MediaPreviewRequest["purpose"];
  isVisible: boolean;
  onChange: (snapshot: MediaLeaseSnapshot) => void;
};
type Entry = {
  itemId: string;
  purpose: MediaPreviewRequest["purpose"];
  snapshot: MediaLeaseSnapshot;
  initialMedia: MediaRef;
  consumers: Map<LeaseConsumer["onChange"], boolean>;
  denied: boolean;
  attemptedUrl: string | undefined;
  pending: Promise<MediaRef | undefined> | undefined;
  isExplicit: boolean;
  settle: ((media: MediaRef | undefined) => void) | undefined;
};
type State = {
  deniedIds: Set<string>;
  authorizationLost: boolean;
  store: MediaPreviewStore;
  read: (request: MediaPreviewRequest) => Promise<MediaPreview[]>;
  onAuthorizationLoss: () => void;
  onReturn: () => void;
  entries: Map<string, Entry>;
  queue: Set<Entry>;
  timer: ReturnType<typeof setTimeout> | undefined;
  flushTimer: ReturnType<typeof setTimeout> | undefined;
};

function _expiry(entry: Readonly<Entry>): number {
  const media = entry.snapshot.media;
  if (media === undefined) {
    return Infinity;
  }
  const sources =
    entry.purpose === "speculative-preview"
      ? [media.thumb]
      : [
          media.playback,
          media.display,
          ...media.displayCandidates,
          media.poster,
          media.thumb,
        ];
  return Math.min(
    ...sources.flatMap((source) => {
      return source === null ? [] : [Date.parse(source.expiresAt)];
    }),
  );
}
function _publish(entry: Entry, snapshot: MediaLeaseSnapshot): void {
  entry.snapshot = snapshot;
  entry.consumers.forEach((_visible, onChange) => {
    onChange(snapshot);
  });
}
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
      return _expiry(entry) - Date.now() - 60_000;
    }),
  );
  if (!Number.isFinite(delay)) {
    return;
  }
  state.timer = setTimeout(
    () => {
      eligible
        .filter((entry) => {
          return _expiry(entry) <= Date.now() + 60_000;
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
      _publish(entry, { media: undefined, hasError: true });
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
    _listen(state.onReturn, true);
    _publish(entry, { media: preview.media, hasError: false });
    entry.attemptedUrl =
      _expiry(entry) > Date.now() + 60_000 ? undefined : "stale";
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
      _publish(entry, { ...entry.snapshot, hasError: true });
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
        _expiry(entry) <= Date.now() + 60_000
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
    )
      return true;
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
function _getSourceIdentityFromMedia(media: Readonly<MediaRef>): string {
  return [
    media.thumb,
    media.display,
    media.playback,
    media.poster,
    ...media.displayCandidates,
  ]
    .map((source) => {
      return source?.renditionId;
    })
    .join(":");
}
function _seed(state: State, itemId: string, media: MediaRef): void {
  state.store.put([
    {
      itemId,
      kind: media.durationMs === null ? "photo" : "video",
      width: media.width,
      height: media.height,
      media,
    },
  ]);
}
function _getEntry(state: State, consumer: Readonly<LeaseConsumer>): Entry {
  const key = `${consumer.purpose}:${consumer.itemId}`;
  const existing = state.entries.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const denied =
    state.authorizationLost || state.deniedIds.has(consumer.itemId);
  const entry: Entry = {
    itemId: consumer.itemId,
    purpose: consumer.purpose,
    snapshot: {
      media: denied ? undefined : consumer.initialMedia,
      hasError: denied,
    },
    initialMedia: consumer.initialMedia,
    consumers: new Map(),
    denied,
    attemptedUrl: undefined,
    pending: undefined,
    isExplicit: false,
    settle: undefined,
  };
  state.entries.set(key, entry);
  if (!denied && state.store.read(consumer.itemId) === undefined) {
    _seed(state, consumer.itemId, consumer.initialMedia);
  }
  return entry;
}
function _updateInitial(state: State, entry: Entry, media: MediaRef): void {
  if (
    !entry.denied &&
    _getSourceIdentityFromMedia(media) !==
      _getSourceIdentityFromMedia(entry.initialMedia)
  ) {
    state.store.remove(entry.itemId);
    _seed(state, entry.itemId, media);
    entry.attemptedUrl = undefined;
    _publish(entry, { media, hasError: false });
    _schedule(state);
  }
  entry.initialMedia = media;
}
function _register(
  state: State,
  consumer: Readonly<LeaseConsumer>,
): MediaLeaseRegistration {
  const entry = _getEntry(state, consumer);
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
function _listen(onReturn: () => void, enabled: boolean): void {
  if (enabled) {
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    window.addEventListener("online", onReturn);
  } else {
    document.removeEventListener("visibilitychange", onReturn);
    window.removeEventListener("focus", onReturn);
    window.removeEventListener("online", onReturn);
  }
}
function _clear(state: State): void {
  state.deniedIds.clear();
  state.authorizationLost = false;
  clearTimeout(state.timer);
  clearTimeout(state.flushTimer);
  state.flushTimer = undefined;
  state.queue.clear();
  state.entries.forEach((entry) => {
    entry.denied = true;
    _publish(entry, { media: undefined, hasError: true });
    entry.settle?.(undefined);
    entry.pending = undefined;
  });
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
      _listen(state.onReturn, true);
      const registration = _register(state, consumer);
      return {
        ...registration,
        release: () => {
          registration.release();
          if (state.entries.size === 0) {
            _listen(state.onReturn, false);
          }
        },
      };
    },
    clear: () => {
      _clear(state);
      _listen(state.onReturn, false);
    },
    isDenied: (itemId) => {
      return state.authorizationLost || state.deniedIds.has(itemId);
    },
  };
}
