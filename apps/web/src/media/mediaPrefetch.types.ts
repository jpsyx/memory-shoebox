import type { MediaSource } from "@memory-shoebox/shared";

/** One exact rendition selected by the same policy as its eventual display. */
export type PrefetchCandidate = {
  itemId: string;
  source: MediaSource;
  kind: "photo" | "poster" | "video-metadata";
  rank: number;
  decode: boolean;
};

/** Member, selection and browser constraints for a speculative window. */
export type PrefetchEnvironment = {
  memberId: string;
  selectionKey: string;
  visible: boolean;
  saveData: boolean;
  effectiveType: "slow-2g" | "2g" | "3g" | "4g" | "unknown";
};

/** One completed native decode; its accessor becomes empty when released. */
export type DecodedPhoto = {
  itemId: string;
  source: MediaSource;
  getImage: () => HTMLImageElement | undefined;
};

/** Releases only app-owned references, never the browser's HTTP cache. */
export type SpeculativeMedia = {
  /** Idempotently drops the settled native element reference. */
  release: () => void;
  decodedPhoto?: DecodedPhoto;
};

/** Must settle only after the underlying transfer/decode has settled. */
export type SpeculativeMediaLoader = (
  candidate: Readonly<PrefetchCandidate>,
  signal: AbortSignal,
) => Promise<SpeculativeMedia>;

/** Exact foreground destination; transport deduplication still uses rendition. */
export type MediaDestination = {
  itemId: string;
  source: Pick<MediaSource, "url" | "renditionId"> | undefined;
};

/** Separate temporary pixels from the foreground transport lifetime. */
export type MediaPromotion = {
  release: () => void;
  finishSelectedDecode: () => void;
  readonly decodedPhoto: DecodedPhoto | undefined;
};

/** A bounded speculative window, isolated from actual-detail reads. */
export type MediaPrefetchScheduler = {
  /** Call after selected-source readiness; a changed selection starts dwell. */
  schedule: (
    candidates: readonly PrefetchCandidate[],
    environment: Readonly<PrefetchEnvironment>,
  ) => void;
  /**
   * Acquire foreground ownership before route cleanup. The caller must retain
   * the returned idempotent release across navigation and call it on failed
   * adoption or foreground source/view exit. Each call owns a separate lease.
   */
  promote: (destination: Readonly<MediaDestination>) => MediaPromotion;
  /** Drop speculation; live foreground leases keep unsettled work running. */
  clear: () => void;
  /** Permanently stop this owner and release completed references. */
  dispose: () => void;
};
