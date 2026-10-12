import { afterEach, expect, it, vi } from "vitest";
import { animatePaperChange } from "./animatePaperChange";
afterEach(() => {
  vi.restoreAllMocks();
  delete (document as Partial<Document>).startViewTransition;
});
it("applies the change once when the browser cannot animate snapshots", () => {
  const change = vi.fn();
  animatePaperChange(change);
  expect(change).toHaveBeenCalledOnce();
});
it("applies reduced-motion changes without a spatial view transition", () => {
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches: true,
  } as MediaQueryList);
  const start = vi.fn();
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: start,
  });
  const change = vi.fn();
  animatePaperChange(change);
  expect(change).toHaveBeenCalledOnce();
  expect(start).not.toHaveBeenCalled();
});
