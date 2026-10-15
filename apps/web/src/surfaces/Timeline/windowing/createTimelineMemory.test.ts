import { expect, it } from "vitest";
import { createTimelineMemory } from "./createTimelineMemory";

it("bounds compact view anchors and expansions and clears authority state", () => {
  const memory = createTimelineMemory();
  memory.get("first").anchor = {
    capturedOn: "2026-01-01",
    offsetPx: 10,
    pageCursor: "issued",
  };
  for (let index = 0; index < 20; index += 1) memory.get(`view-${index}`);
  expect(memory.get("first").anchor).toBeUndefined();
  const view = memory.get("current");
  for (let index = 0; index < 21; index += 1)
    memory.expand("current", `burst-${index}`, 200);
  expect(view.expanded.size).toBe(20);
  expect(view.expanded.has("burst-0")).toBe(false);
  memory.clear();
  expect(memory.get("current").expanded.size).toBe(0);
});
