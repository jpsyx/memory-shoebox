import type { BurstFrameRef } from "@memory-shoebox/shared";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { createTimelineMemory } from "../../windowing/createTimelineMemory/createTimelineMemory";

/** A shared burst read may retire before producing visible frames. */
export type PendingFrameRead = Promise<readonly BurstFrameRef[] | undefined>;

/** Retained browsing context that owns expansion memory for one view. */
export type Options = {
  viewKey: string;
  memory: ReturnType<typeof createTimelineMemory>;
  retainedBurstIds: ReadonlySet<string>;
};

/** Stable refs and setters shared by burst lifetime and opening hooks. */
export type BurstState = {
  framesByBurstId: Map<string, readonly BurstFrameRef[]>;
  setFramesByBurstId: FrameSetter;
  revision: number;
  setRevision: Dispatch<SetStateAction<number>>;
  generation: RefObject<number>;
  pending: RefObject<Map<string, PendingFrameRead>>;
  owned: RefObject<Set<string>>;
  latest: RefObject<Options | undefined>;
};

/** Updates the current browsing frames without changing the owning hook. */
export type FrameSetter = Dispatch<
  SetStateAction<Map<string, readonly BurstFrameRef[]>>
>;
