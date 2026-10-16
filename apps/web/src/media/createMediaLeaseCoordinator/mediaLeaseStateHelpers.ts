import type { MediaRef } from "@memory-shoebox/shared";

import {
  type Entry,
  type LeaseConsumer,
  type MediaLeaseSnapshot,
  type State,
} from "./createMediaLeaseCoordinator.types";

/**
 * Returns the earliest expiry of sources eligible for this consumer purpose, or
 * Infinity when no source is present.
 */
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

/**
 * Replaces the entry snapshot and synchronously notifies every registered
 * consumer, including currently hidden consumers.
 */
export function publishMediaLeaseSnapshot({
  entry,
  snapshot,
}: Readonly<{ entry: Entry; snapshot: Readonly<MediaLeaseSnapshot> }>): void {
  entry.snapshot = snapshot;
  entry.consumers.forEach((_visible, onChange) => {
    onChange(snapshot);
  });
}

/**
 * Joins rendition IDs in stable source order so source replacement is distinct
 * from signed URL renewal.
 */
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

/**
 * Seeds the safe-preview store from an authorized media reference without
 * touching actual-detail/open state.
 */
export function seedMediaPreviewStore({
  state,
  itemId,
  media,
}: Readonly<{
  state: State;
  itemId: string;
  media: Readonly<MediaRef>;
}>): void {
  state.store.put({
    previews: [
      {
        itemId,
        kind: media.durationMs === null ? "photo" : "video",
        width: media.width,
        height: media.height,
        media,
      },
    ],
  });
}

/**
 * Returns the purpose/item entry, creating it when absent. Authorization denial
 * blocks initial media and preview-store seeding.
 */
export function registerMediaConsumer({
  state,
  consumer,
}: Readonly<{ state: State; consumer: Readonly<LeaseConsumer> }>): Entry {
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
    seedMediaPreviewStore({
      state,
      itemId: consumer.itemId,
      media: consumer.initialMedia,
    });
  }
  return entry;
}

/**
 * Adds or removes the same visibility, focus and online callback; the
 * coordinator owns listener lifetime.
 */
export function listenForMediaReturn({
  onReturn,
  enabled,
}: Readonly<{ onReturn: () => void; enabled: boolean }>): void {
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

/**
 * Clears queued renewal state, invalidates every entry and settles pending
 * consumers without media.
 */
export function clearMediaLeaseState(state: State): void {
  state.deniedIds.clear();
  state.authorizationLost = false;
  clearTimeout(state.timer);
  clearTimeout(state.flushTimer);
  state.flushTimer = undefined;
  state.queue.clear();
  state.entries.forEach((entry) => {
    entry.denied = true;
    publishMediaLeaseSnapshot({
      entry,
      snapshot: { media: undefined, hasError: true },
    });
    entry.settle?.(undefined);
    entry.pending = undefined;
  });
}
