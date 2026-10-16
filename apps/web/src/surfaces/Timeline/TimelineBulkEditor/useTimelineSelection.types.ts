import type { TimelineSelection } from "@/api/timelineHelpers/timelineSelectionHelpers/timelineSelectionHelpers";
import type { BurstFrameRef, TimelineDay } from "@memory-shoebox/shared";
import type { Dispatch, RefObject, SetStateAction } from "react";

/** Published tick state and frames read with the active timeline filters. */
export type TimelineSelectionSnapshot = {
  isSelecting: boolean;
  selectedItemIds: Set<string>;
  framesByBurstId: Map<string, BurstFrameRef[]>;
  isLoading: boolean;
  problem?: string;
};

/**
 * Explicit operations available to the timeline's selection toolbar and prints.
 */
export type TimelineSelectionActions = {
  onToggle: (itemId: string) => void;
  onOpenBurst: (burstId: string) => void;
  clear: () => void;
  start: () => void;
  finish: () => void;
  tickLoaded: () => void;
};

/** Complete selection boundary consumed by the bulk editor. */
export type TimelineSelectionState = TimelineSelectionSnapshot &
  TimelineSelectionActions;

/**
 * State publication and a synchronous read guard shared by selection
 * operations.
 */
export type TimelineSelectionContext = {
  days: readonly TimelineDay[];
  filterSelection?: Readonly<TimelineSelection>;
  setSnapshot: Dispatch<SetStateAction<TimelineSelectionSnapshot>>;
  pending: RefObject<boolean>;
};
