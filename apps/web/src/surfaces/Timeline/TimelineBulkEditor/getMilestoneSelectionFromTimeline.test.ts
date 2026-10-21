import { makeBurst, makeDay, makeItem } from "../timelineFixtureHelpers";
import { makeInitialMilestoneFieldsFromOptions } from "@/surfaces/Milestones/useMilestoneForm/milestoneFormHelpers";
import type { BurstFrameRef } from "@memory-shoebox/shared";
import { expect, it } from "vitest";
import { getMilestoneSelectionFromTimeline } from "./getMilestoneSelectionFromTimeline";

it("keeps selected stack frames and unloaded items while prefilling only known capture days", () => {
  const burst = makeBurst();
  const frame: BurstFrameRef = {
    itemId: "018f0000-0000-7000-8000-00000000a002",
    position: 2,
    thumb: null,
    width: 800,
    height: 600,
    previewState: "pending",
    altText: "A second frame",
  };
  const unloadedId = "018f0000-0000-7000-8000-00000000a003";
  const selection = getMilestoneSelectionFromTimeline({
    itemIds: [unloadedId, frame.itemId],
    days: [makeDay({ items: [makeItem({ burst })] })],
    framesByBurstId: new Map([[burst.burstId, [frame]]]),
  });
  expect(selection).toEqual([
    { itemId: unloadedId, capturedOn: undefined },
    { itemId: frame.itemId, capturedOn: "2026-09-27" },
  ]);
  expect(makeInitialMilestoneFieldsFromOptions({ selection }).span).toEqual({
    startsOn: "2026-09-27",
    endsOn: "2026-09-27",
    isMultiDay: false,
  });
});
