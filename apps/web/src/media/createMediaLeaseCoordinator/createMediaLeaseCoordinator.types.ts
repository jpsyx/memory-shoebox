import type {
  MediaPreview,
  MediaPreviewRequest,
  MediaRef,
} from "@memory-shoebox/shared";

import type { MediaPreviewStore } from "../createMediaPreviewStore/createMediaPreviewStore";

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

/** One purpose/item lease entry, including consumers, authorization denial and shared pending renewal settlement. */
export type Entry = {
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

/** Member-scoped lease ownership: entries, denied IDs, preview store, queued batches and scheduling handles. */
export type State = {
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
