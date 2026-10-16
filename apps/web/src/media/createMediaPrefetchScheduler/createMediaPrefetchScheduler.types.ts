import type {
  MediaDestination,
  PrefetchCandidate,
  PrefetchEnvironment,
  SpeculativeMedia,
  SpeculativeMediaLoader,
} from "../mediaPrefetch.types";

/** Shared owners captured by one foreground media promotion. */
export type MediaPromotionOptions = {
  state: SchedulerState;
  destination: Readonly<MediaDestination>;
  operation: Operation | undefined;
  handoff: Handoff | undefined;
};

/** One admitted load and the foreground owners keeping it alive. */
export type Operation = {
  candidate: PrefetchCandidate;
  controller: AbortController;
  generation: number;
  foregroundOwners: number;
  epoch: unknown;
};
/** A completed speculative decode and the authority epoch that owns it. */
export type RetainedMedia = {
  candidate: PrefetchCandidate;
  media: SpeculativeMedia;
  epoch: unknown;
};
/** A retained decode temporarily shared by selected-view consumers. */
export type Handoff = RetainedMedia & { owners: number };
/** Mutable ownership and budget state for one member prefetch window. */
export type SchedulerState = {
  load: SpeculativeMediaLoader;
  clock: () => number;
  getEpoch: () => unknown;
  candidates: PrefetchCandidate[];
  environment: PrefetchEnvironment | undefined;
  active: Map<string, Operation>;
  completed: Set<string>;
  retained: RetainedMedia | undefined;
  handoff: Handoff | undefined;
  generation: number;
  readyAt: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  disposed: boolean;
};
