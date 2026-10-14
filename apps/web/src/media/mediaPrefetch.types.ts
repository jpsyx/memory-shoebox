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

/** Releases only app-owned references, never the browser's HTTP cache. */
export type SpeculativeMedia = {
  /** Idempotently drops the settled native element reference. */
  release: () => void;
};

/** Must settle only after the underlying transfer/decode has settled. */
export type SpeculativeMediaLoader = (
  candidate: Readonly<PrefetchCandidate>,
  signal: AbortSignal,
) => Promise<SpeculativeMedia>;

/** A bounded speculative window, isolated from actual-detail reads. */
export type MediaPrefetchScheduler = {
  /** Call after selected-source readiness; a changed selection starts dwell. */
  schedule: (
    candidates: readonly PrefetchCandidate[],
    environment: Readonly<PrefetchEnvironment>,
  ) => void;
  /** Foreground adoption must leave a shared native image request running. */
  promote: (renditionId: string) => void;
  /** Drop queued work and references, retaining unsettled reservations. */
  clear: () => void;
  /** Permanently stop this owner and release completed references. */
  dispose: () => void;
};
