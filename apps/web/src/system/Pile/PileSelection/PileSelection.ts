import { createContext } from "react";
import type { BurstFrameRef } from "@memory-shoebox/shared";

/** Optional tick mode shared by plain prints and individual burst frames. */
export type PileSelection = {
  selectedItemIds: ReadonlySet<string>;
  framesByBurstId: ReadonlyMap<string, readonly BurstFrameRef[]>;
  isBusy: boolean;
  onToggle: (itemId: string) => void;
  /** Loads frames matching the active filters independently of browsing caches. */
  onOpenBurst: (burstId: string) => void;
};

/** Absent outside timeline selection, including the upload preview. */
export const PileSelectionContext = createContext<PileSelection | undefined>(
  undefined,
);
