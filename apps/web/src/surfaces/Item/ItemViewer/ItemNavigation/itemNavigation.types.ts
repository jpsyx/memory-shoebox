import type { ItemDetail } from "@memory-shoebox/shared";
import type { QueryClient } from "@tanstack/react-query";
import type { TimelineSelection } from "@/api/timeline/selection/selection";

/** Direction through the timeline, including the frames inside each stack. */
export type ItemDirection = "previous" | "next";

/** A plain item, or a stack whose edge is read only when navigation is requested. */
export type ItemNavigationTarget = { itemId: string; burstId?: string };

/** Inputs for finding neighbours without opening their item permalinks. */
export type ItemNavigationContext = {
  detail: ItemDetail;
  selection: TimelineSelection;
  queryClient: QueryClient;
  memberId: string;
};

declare module "@tanstack/react-router" {
  interface HistoryState {
    /** The originating timeline's filters, preserved across viewer moves. */
    itemNavigationSelection?: TimelineSelection;
  }
}

/** Navigation availability and recovery exposed to the shared toolbar. */
export type ItemNavigationState = {
  previous: boolean;
  next: boolean;
  move: (direction: ItemDirection) => Promise<void>;
  error: string | undefined;
  retry: () => void;
};

/** Serialized movement state while a destination stack is being read. */
export type ItemNavigationMovement = {
  isMoving: boolean;
  error: string | undefined;
  move: (direction: ItemDirection) => Promise<void>;
  clearError: () => void;
};
