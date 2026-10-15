import type { MediaPreview } from "@memory-shoebox/shared";

const EPOCH_BRAND: unique symbol = Symbol("media-preview-epoch");
/** Opaque identity scoped to one store instance and one member epoch. */
export type MediaPreviewEpoch = { readonly [EPOCH_BRAND]: string };

/** Memory-only media state, separate from actual-detail and authority caches. */
export type MediaPreviewStore = {
  /** Reads and promotes an entry in the 64-entry LRU. */
  read: (itemId: string) => MediaPreview | undefined;
  /**
   * Synchronous seeding may omit the token. Every async writer must pass the
   * token captured before its request, even when it also aborts that request.
   */
  put: (previews: readonly MediaPreview[], epoch?: MediaPreviewEpoch) => void;
  /** Drops one entry and invalidates outstanding writes that could restore it. */
  remove: (itemId: string) => void;
  /** Clears entries and invalidates outstanding member-epoch tokens. */
  clear: () => void;
  /** Captures this member/store epoch before any asynchronous work starts. */
  captureEpoch: () => MediaPreviewEpoch;
};

function _putPreview(
  entries: Map<string, MediaPreview>,
  preview: MediaPreview,
): void {
  entries.delete(preview.itemId);
  entries.set(preview.itemId, preview);
  if (entries.size > 64) {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) {
      entries.delete(oldest);
    }
  }
}

/** Creates an isolated member's bounded store; replacement shares no data. */
export function createMediaPreviewStore(memberId: string): MediaPreviewStore {
  const entries = new Map<string, MediaPreview>();
  let epoch = Object.freeze({ [EPOCH_BRAND]: memberId });
  return {
    read: (itemId) => {
      const preview = entries.get(itemId);
      if (preview !== undefined) {
        _putPreview(entries, preview);
      }
      return preview;
    },
    put: (previews, capturedEpoch) => {
      if (capturedEpoch !== undefined && capturedEpoch !== epoch) {
        return;
      }
      previews.forEach((preview) => {
        _putPreview(entries, preview);
      });
    },
    remove: (itemId) => {
      entries.delete(itemId);
      epoch = Object.freeze({ [EPOCH_BRAND]: memberId });
    },
    clear: () => {
      entries.clear();
      epoch = Object.freeze({ [EPOCH_BRAND]: memberId });
    },
    captureEpoch: () => {
      return epoch;
    },
  };
}
