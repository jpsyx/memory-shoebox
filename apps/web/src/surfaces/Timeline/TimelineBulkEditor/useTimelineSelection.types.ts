import type { TimelineSelection } from "@/api/timelineHelpers/timelineSelectionHelpers/timelineSelectionHelpers";
import type { BurstFrameRef, TimelineDay } from "@memory-shoebox/shared";

/** A range endpoint is one photo or an entire collapsed burst. */
export type SelectionTarget =
  | { kind: "item"; itemId: string }
  | { kind: "burst"; burstId: string };

/** Published ticks and complete membership read under the active filters. */
export type TimelineSelectionSnapshot = {
  isSelecting: boolean;
  openedBurstIds: Set<string>;
  selectedItemIds: Set<string>;
  framesByBurstId: Map<string, BurstFrameRef[]>;
  isLoading: boolean;
  problem?: string;
};

/** Explicit operations available to selection toolbars and prints. */
export type TimelineSelectionActions = {
  onToggle: (itemId: string) => void;
  onSelect: (target: SelectionTarget, modifiers: { shiftKey: boolean }) => void;
  onSelectBurst: (burstId: string) => void;
  onDeselectBurst: (burstId: string) => void;
  onOpenBurst: (burstId: string) => void;
  onCollapseBurst: (burstId: string) => void;
  clear: () => void;
  start: () => void;
  finish: () => void;
  tickLoaded: () => void;
};

/** Complete selection boundary consumed by the bulk editor. */
export type TimelineSelectionState = TimelineSelectionSnapshot &
  TimelineSelectionActions;

/** Mutable owner for ordered reads and synchronous click publication. */
export type TimelineSelectionContext = {
  days: readonly TimelineDay[];
  filterSelection?: Readonly<TimelineSelection>;
  snapshot: TimelineSelectionSnapshot;
  epoch: number;
  rangeEpoch: number;
  rangeQueued: number;
  cancelRangeRead?: () => void;
  anchor?: SelectionTarget;
  queue: Promise<void>;
  queued: number;
  publish: (snapshot: TimelineSelectionSnapshot) => void;
};
