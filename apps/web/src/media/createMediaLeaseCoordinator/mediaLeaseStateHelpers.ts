import type { MediaRef } from "@memory-shoebox/shared";

import {
  type Entry,
  type LeaseConsumer,
  type MediaLeaseSnapshot,
  type State,
} from "./createMediaLeaseCoordinator.types";

/** Internal module responsibility shared by the entry point. */
export function getExpiryFromMediaLease(entry: Readonly<Entry>): number {
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

/** Internal module responsibility shared by the entry point. */
export function publishMediaLeaseSnapshot(
  entry: Entry,
  snapshot: MediaLeaseSnapshot,
): void {
  entry.snapshot = snapshot;
  entry.consumers.forEach((_visible, onChange) => {
    onChange(snapshot);
  });
}

/** Internal module responsibility shared by the entry point. */
export function getSourceIdentityFromMedia(media: Readonly<MediaRef>): string {
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

/** Internal module responsibility shared by the entry point. */
export function seedMediaPreviewStore(
  state: State,
  itemId: string,
  media: MediaRef,
): void {
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

/** Internal module responsibility shared by the entry point. */
export function getEntryFromMediaConsumer(
  state: State,
  consumer: Readonly<LeaseConsumer>,
): Entry {
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
    seedMediaPreviewStore(state, consumer.itemId, consumer.initialMedia);
  }
  return entry;
}

/** Internal module responsibility shared by the entry point. */
export function listenForMediaReturn(
  onReturn: () => void,
  enabled: boolean,
): void {
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

/** Internal module responsibility shared by the entry point. */
export function clearMediaLeaseState(state: State): void {
  state.deniedIds.clear();
  state.authorizationLost = false;
  clearTimeout(state.timer);
  clearTimeout(state.flushTimer);
  state.flushTimer = undefined;
  state.queue.clear();
  state.entries.forEach((entry) => {
    entry.denied = true;
    publishMediaLeaseSnapshot(entry, { media: undefined, hasError: true });
    entry.settle?.(undefined);
    entry.pending = undefined;
  });
}
